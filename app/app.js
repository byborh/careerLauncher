/* app.js - state, merge engine, three screens, tracker.
 * No build step, no framework, no CDN. Plain DOM.
 */
(function () {
  'use strict';

  var FOLLOWUP_DAYS = 10;

  var STATUSES = [
    { value: 'pending',    label: 'pending',    cls: 'st-pending' },
    { value: 'replied+',   label: 'replied +',  cls: 'st-repliedp' },
    { value: 'replied-',   label: 'replied −',  cls: 'st-repliedn' },
    { value: 'interview',  label: 'interview',  cls: 'st-interview' },
    { value: 'offer',      label: 'offer',      cls: 'st-offer' },
    { value: 'rejected',   label: 'rejected',   cls: 'st-rejected' },
    { value: 'ghosted',    label: 'ghosted',    cls: 'st-ghosted' }
  ];

  /* ------------------------------------------------------------- utilities */

  function $(id) { return document.getElementById(id); }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k.indexOf('on') === 0) node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) { if (c) node.appendChild(c); });
    return node;
  }

  function todayISO() {
    var d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function addDaysISO(iso, days) {
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + days);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  }

  function uid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  var toastTimer = null;
  function toast(message) {
    var t = $('toast');
    t.textContent = message;
    t.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.hidden = true; }, 2600);
  }

  /* ------------------------------------------------------------------ state */

  function defaultState() {
    return {
      version: 1,
      profile: {
        name: '', role: '', skills: [], portfolio: '', linkedin: '',
        github: '', phone: '', email: '', cvFileName: ''
      },
      templates: JSON.parse(JSON.stringify(window.CL_TEMPLATES)),
      applications: []
    };
  }

  function normalize(raw) {
    var base = defaultState();
    if (!raw || typeof raw !== 'object') return base;

    var p = raw.profile || {};
    Object.keys(base.profile).forEach(function (k) {
      if (k === 'skills') {
        base.profile.skills = Array.isArray(p.skills)
          ? p.skills.filter(function (s) { return String(s).trim() !== ''; })
          : String(p.skills || '').split('\n').filter(function (s) { return s.trim() !== ''; });
      } else {
        base.profile[k] = typeof p[k] === 'string' ? p[k] : '';
      }
    });

    if (Array.isArray(raw.templates) && raw.templates.length) {
      base.templates = raw.templates.filter(function (t) { return t && t.id; }).map(function (t) {
        return { id: String(t.id), name: String(t.name || t.id), subject: String(t.subject || ''), body: String(t.body || '') };
      });
    }

    if (Array.isArray(raw.applications)) {
      base.applications = raw.applications.map(function (a) {
        var sent = a.dateSent || todayISO();
        return {
          id: a.id || uid(),
          company: String(a.company || ''),
          email: String(a.email || ''),
          role: String(a.role || ''),
          templateId: String(a.templateId || ''),
          dateSent: sent,
          status: STATUSES.some(function (s) { return s.value === a.status; }) ? a.status : 'pending',
          responseDate: a.responseDate || null,
          notes: String(a.notes || ''),
          followUpOn: a.followUpOn || addDaysISO(sent, FOLLOWUP_DAYS),
          // Firestore stores applications as an unordered collection, so the
          // row order has to be a value, not an array position. Rows written
          // before this existed get a deterministic one derived from dateSent.
          createdAt: String(a.createdAt || sent + 'T00:00:00.000Z')
        };
      });
      sortApplications(base.applications);
    }
    return base;
  }

  /** Newest first - the same order the array used to get from unshift(). */
  function sortApplications(list) {
    list.sort(function (a, b) {
      var ka = (a.createdAt || a.dateSent || '') + '|' + a.id;
      var kb = (b.createdAt || b.dateSent || '') + '|' + b.id;
      return ka < kb ? 1 : (ka > kb ? -1 : 0);
    });
    return list;
  }

  var state = defaultState();
  var companies = [];
  var companiesFetchedAt = null;
  var selected = null;      // selected company row
  var whySeed = '';         // last auto-seeded "why" draft, so we can detect it
  var currentView = 'all';
  var editingTemplateId = null;

  function persist() { window.CLStore.save(state); }

  /* ------------------------------------------------------------ merge engine */

  function skillsBlock() {
    var s = state.profile.skills;
    if (!s || !s.length) return null;
    return s.map(function (line) { return '- ' + line; }).join('\n');
  }

  function missing(label) { return '⟨' + label + '⟩'; }

  function whyValue() {
    var raw = $('whyInput').value.trim();
    if (!raw) {
      return missing('REWRITE: one specific, genuine reason you admire ' +
                     (selected ? selected.company : 'this company'));
    }
    return raw;
  }

  function tokens() {
    var p = state.profile;
    var c = selected || {};
    return {
      company: c.company || missing('PICK A COMPANY'),
      email: c.email || missing('PICK A COMPANY'),
      description: c.description || missing('no description in the dataset'),
      role: $('roleInput').value.trim() || missing('SET THE ROLE ABOVE'),
      why: whyValue(),
      name: p.name || missing('SET name IN PROFILE'),
      skills: skillsBlock() || missing('SET skills IN PROFILE'),
      portfolio: p.portfolio || missing('SET portfolio IN PROFILE'),
      linkedin: p.linkedin || missing('SET linkedin IN PROFILE'),
      github: p.github || missing('SET github IN PROFILE'),
      phone: p.phone || missing('SET phone IN PROFILE'),
      userEmail: p.email || missing('SET email IN PROFILE'),
      cvFileName: p.cvFileName || missing('SET CV file name IN PROFILE')
    };
  }

  function merge(text, map) {
    return String(text || '').replace(/\{\{\s*([a-zA-Z]+)\s*\}\}/g, function (whole, key) {
      return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : missing('unknown token ' + key);
    });
  }

  function currentTemplate() {
    var id = $('templatePick').value;
    return state.templates.filter(function (t) { return t.id === id; })[0] || state.templates[0] || null;
  }

  function usesWhy(tpl) {
    return !!tpl && /\{\{\s*why\s*\}\}/.test(String(tpl.subject) + ' ' + String(tpl.body));
  }

  /**
   * The "why this company" line is still the difference between a read email
   * and a deleted one — but it is advice, not a gate. Plenty of legitimate
   * emails do not need it, and a template that never merges {{why}} (a
   * follow-up, say) should not nag about it at all.
   *
   * Returns something worth saying, or '' when there is nothing to say.
   * It never prevents anything.
   */
  function whyAdvice(tpl) {
    if (!usesWhy(tpl)) return '';
    var why = $('whyInput').value.trim();
    if (!why) {
      return 'No “why this company” line. This template merges one, so the email will go out ' +
             'with a visible ⟨…⟩ gap — and without it, it reads as a mail merge.';
    }
    if (whySeed && why === whySeed.trim()) {
      return 'That line is still the auto-generated draft. Rewriting it in your own words is the whole point.';
    }
    if (/⟨|REWRITE/i.test(why)) return 'That line still contains placeholder text.';
    if (why.length < 25) {
      return 'That line is very short. One specific thing — a product, a paper, a release — beats a sentence of praise.';
    }
    return '';
  }

  function renderPreview() {
    var tpl = currentTemplate();
    var map = tokens();
    $('previewTo').textContent = selected ? selected.email : '—';
    $('previewSubject').value = tpl ? merge(tpl.subject, map) : '';
    $('previewBody').value = tpl ? merge(tpl.body, map) : '';

    // Copying is never blocked: it is your email, and you decide what goes in
    // it. Logging still needs a company, because that is what gets logged.
    var advice = whyAdvice(tpl);
    var note = $('whyNote');
    note.hidden = !advice;
    note.textContent = advice ? '💡 ' + advice : '';
    $('btnLog').disabled = !selected;

    $('whyState').className = 'small';
    if (!usesWhy(tpl)) {
      $('whyState').textContent = 'not used by this template';
      $('whyState').className = 'small muted';
    } else if (advice) {
      $('whyState').textContent = '';
    } else {
      $('whyState').textContent = '✓ personalized';
      $('whyState').className = 'small ok';
    }

    var cv = state.profile.cvFileName;
    $('cvReminder').textContent = cv
      ? '📎 Don\'t forget to attach your CV (' + cv + ') in your mail client - this page cannot do it for you.'
      : '📎 Don\'t forget to attach your CV in your mail client. (Add its file name in Profile to see it here.)';
  }

  /* ------------------------------------------------------------- companies */

  function setCompanies(rows) {
    companies = rows.map(function (r) { return window.CLData.decorate(r); });
    renderCompanyList();
    renderDatasetInfo();
  }

  function renderDatasetInfo() {
    var usable = companies.filter(function (c) { return c.applyLevel !== 'blocked'; }).length;
    var when = companiesFetchedAt
      ? new Date(companiesFetchedAt).toLocaleDateString()
      : 'bundled snapshot';
    $('datasetInfo').textContent = usable + ' companies · ' +
      (companies.length - usable) + ' hidden (not for applications) · ' + when;
  }

  function renderCompanyList() {
    var q = $('companySearch').value.trim().toLowerCase();
    var box = $('companyList');
    box.textContent = '';

    var rows = companies.filter(function (c) {
      if (c.applyLevel === 'blocked') return false; // §8: never offer a known-bad target
      if (!q) return true;
      return (c.company + ' ' + c.email + ' ' + c.location + ' ' + c.description + ' ' + c.domain)
        .toLowerCase().indexOf(q) !== -1;
    });

    if (!rows.length) {
      box.appendChild(el('p', { class: 'empty small', text: 'No match. Use “add it manually” below.' }));
      return;
    }

    rows.slice(0, 200).forEach(function (c) {
      var btn = el('button', {
        class: 'company' + (selected && selected.email === c.email && selected.company === c.company ? ' is-selected' : ''),
        type: 'button',
        onclick: function () { selectCompany(c); }
      });
      var title = el('span', { text: c.company });
      if (c.applyLevel === 'warn') title.appendChild(el('span', { class: 'flag', text: 'generic inbox' }));
      btn.appendChild(title);
      btn.appendChild(el('span', { class: 'meta', text: c.email + (c.location ? ' · ' + c.location : '') }));
      box.appendChild(btn);
    });

    if (rows.length > 200) {
      box.appendChild(el('p', { class: 'empty small', text: 'Showing 200 of ' + rows.length + ' - keep typing to narrow it down.' }));
    }
  }

  function selectCompany(c) {
    selected = c;
    whySeed = '';
    $('whyInput').value = '';
    $('selectedCompany').hidden = false;
    $('selCompanyName').textContent = c.company;
    $('selCompanyEmail').textContent = c.email;
    $('selCompanyDesc').textContent = c.description || '';
    var warn = $('selCompanyWarn');
    warn.hidden = !c.applyReason;
    warn.textContent = c.applyReason || '';
    $('btnSeedWhy').disabled = !c.description;
    renderCompanyList();
    renderPreview();
  }

  function clearCompany() {
    selected = null;
    whySeed = '';
    $('selectedCompany').hidden = true;
    renderCompanyList();
    renderPreview();
  }

  function updateData() {
    var btn = $('btnUpdateData');
    btn.disabled = true;
    btn.textContent = 'Updating…';
    window.CLData.fetchCompanies().then(function (rows) {
      companiesFetchedAt = new Date().toISOString();
      window.CLStorage.cacheCompanies(rows);
      setCompanies(rows);
      toast('Updated - ' + rows.length + ' rows from GitHub.');
    }).catch(function (err) {
      toast('Update failed (' + (err.message || err) + '). Using the cached list.');
    }).then(function () {
      btn.disabled = false;
      btn.textContent = 'Update data';
    });
  }

  /* ---------------------------------------------------------------- compose */

  function renderTemplatePickers() {
    var pick = $('templatePick');
    var keep = pick.value;
    pick.textContent = '';
    state.templates.forEach(function (t) {
      pick.appendChild(el('option', { value: t.id, text: t.name + '  (' + t.id + ')' }));
    });
    if (keep && state.templates.some(function (t) { return t.id === keep; })) pick.value = keep;

    var tplPick = $('tplPick');
    var keep2 = editingTemplateId || tplPick.value;
    tplPick.textContent = '';
    state.templates.forEach(function (t) {
      tplPick.appendChild(el('option', { value: t.id, text: t.name + '  (' + t.id + ')' }));
    });
    if (keep2 && state.templates.some(function (t) { return t.id === keep2; })) tplPick.value = keep2;
  }

  function seedWhy() {
    if (!selected || !selected.description) return;
    var d = selected.description.replace(/\s*\.\s*$/, '');
    d = d.charAt(0).toLowerCase() + d.slice(1);
    whySeed = 'your work - ' + d + ' - caught my attention.';
    $('whyInput').value = whySeed;
    renderPreview();
    toast('Draft seeded. Now rewrite it in your own words - it will not copy as-is.');
  }

  function copyText(text, label) {
    var done = function () { toast(label + ' copied.'); };
    var fail = function () { toast('Copy failed - select the text and copy manually.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fail);
    } else {
      var ta = $('previewBody');
      ta.focus(); ta.select();
      try { document.execCommand('copy') ? done() : fail(); } catch (e) { fail(); }
    }
  }

  function logApplication() {
    if (!selected) return;
    var tpl = currentTemplate();
    var sent = todayISO();
    state.applications.unshift({
      id: uid(),
      company: selected.company,
      email: selected.email,
      role: $('roleInput').value.trim(),
      templateId: tpl ? tpl.id : '',
      dateSent: sent,
      status: 'pending',
      responseDate: null,
      notes: '',
      followUpOn: addDaysISO(sent, FOLLOWUP_DAYS),
      createdAt: new Date().toISOString()
    });
    sortApplications(state.applications);
    persist();
    renderTracker();
    toast('Logged - follow up on ' + addDaysISO(sent, FOLLOWUP_DAYS) + '.');
  }

  function useManualCompany() {
    var name = $('manualCompany').value.trim();
    var mail = $('manualEmail').value.trim();
    if (!name || !mail) { toast('Company name and email are both required.'); return; }
    selectCompany({
      company: name, email: mail, description: '', location: '', domain: '',
      applyLevel: 'apply', applyReason: ''
    });
    toast('Using ' + name + '.');
  }

  /* ---------------------------------------------------------------- tracker */

  function isFollowUpDue(a) {
    if (a.status !== 'pending') return false;
    var today = todayISO();
    if (a.followUpOn) return a.followUpOn <= today;
    return a.dateSent && addDaysISO(a.dateSent, FOLLOWUP_DAYS) <= today;
  }

  function needsAction(a) {
    return !!a.responseDate || a.status === 'replied+' || a.status === 'interview' || a.status === 'offer';
  }

  function statusMeta(value) {
    return STATUSES.filter(function (s) { return s.value === value; })[0] || STATUSES[0];
  }

  function templateName(id) {
    var t = state.templates.filter(function (x) { return x.id === id; })[0];
    return t ? t.name : (id || '');
  }

  function updateApp(id, field, value) {
    var a = state.applications.filter(function (x) { return x.id === id; })[0];
    if (!a) return;
    a[field] = value === '' && (field === 'responseDate' || field === 'followUpOn') ? null : value;
    if (field === 'dateSent' && value && !a.followUpOn) a.followUpOn = addDaysISO(value, FOLLOWUP_DAYS);
    persist();
    renderDash();
    // Re-render so filters / due highlighting stay honest, but keep focus.
    var active = document.activeElement;
    var key = active ? active.getAttribute('data-key') : null;
    renderTrackerRows();
    if (key) {
      var again = document.querySelector('[data-key="' + key + '"]');
      if (again) again.focus();
    }
  }

  var CELL_PLACEHOLDER = {
    company: 'Company', email: 'name@company.com', role: 'Role', notes: 'Notes…'
  };

  function cellInput(a, field, type) {
    return el('input', {
      type: type || 'text',
      placeholder: CELL_PLACEHOLDER[field] || null,
      value: a[field] === null || a[field] === undefined ? '' : a[field],
      'data-key': a.id + ':' + field,
      onchange: function (e) { updateApp(a.id, field, e.target.value); }
    });
  }

  function statusSelect(a) {
    var meta = statusMeta(a.status);
    var sel = el('select', {
      class: 'st ' + meta.cls,
      'data-key': a.id + ':status',
      onchange: function (e) { updateApp(a.id, 'status', e.target.value); }
    });
    STATUSES.forEach(function (s) {
      var opt = el('option', { value: s.value, text: s.label });
      if (s.value === a.status) opt.selected = true;
      sel.appendChild(opt);
    });
    return sel;
  }

  function templateSelect(a) {
    var sel = el('select', {
      'data-key': a.id + ':templateId',
      onchange: function (e) { updateApp(a.id, 'templateId', e.target.value); }
    });
    sel.appendChild(el('option', { value: '', text: '-' }));
    state.templates.forEach(function (t) {
      var opt = el('option', { value: t.id, text: t.name });
      if (t.id === a.templateId) opt.selected = true;
      sel.appendChild(opt);
    });
    if (a.templateId && !state.templates.some(function (t) { return t.id === a.templateId; })) {
      var orphan = el('option', { value: a.templateId, text: a.templateId + ' (deleted)' });
      orphan.selected = true;
      sel.appendChild(orphan);
    }
    return sel;
  }

  function visibleApplications() {
    if (currentView === 'followup') return state.applications.filter(isFollowUpDue);
    if (currentView === 'action') return state.applications.filter(needsAction);
    return state.applications;
  }

  // Below 760px the table becomes one card per row and the <thead> is hidden,
  // so every cell has to carry its own label. Same order as the <thead>.
  var COLUMN_LABELS = ['Company', 'Email', 'Role', 'Template', 'Date sent',
                       'Status', 'Response date', 'Follow-up on', 'Notes'];

  function renderTrackerRows() {
    var body = $('trackerBody');
    body.textContent = '';
    var rows = visibleApplications();

    rows.forEach(function (a) {
      var tr = el('tr', { class: isFollowUpDue(a) ? 'is-due' : '' });
      [
        cellInput(a, 'company'),
        cellInput(a, 'email', 'email'),
        cellInput(a, 'role'),
        templateSelect(a),
        cellInput(a, 'dateSent', 'date'),
        statusSelect(a),
        cellInput(a, 'responseDate', 'date'),
        cellInput(a, 'followUpOn', 'date'),
        cellInput(a, 'notes')
      ].forEach(function (control, i) {
        tr.appendChild(el('td', { 'data-label': COLUMN_LABELS[i] }, [control]));
      });

      // On a phone this row is a card and five of its nine fields are folded
      // away; "More" is what unfolds them. It is hidden on wide screens.
      var more = el('button', {
        class: 'btn btn-sm btn-ghost row-more', type: 'button', text: 'More',
        onclick: function () {
          var open = tr.classList.toggle('is-open');
          more.textContent = open ? 'Less' : 'More';
        }
      });

      tr.appendChild(el('td', null, [
        more,
        el('button', {
          class: 'btn btn-sm btn-ghost btn-danger', type: 'button', text: '✕',
          title: 'Delete this row',
          'aria-label': 'Delete the application to ' + (a.company || 'this company'),
          onclick: function () {
            if (!confirm('Delete the application to ' + (a.company || 'this company') + '?')) return;
            state.applications = state.applications.filter(function (x) { return x.id !== a.id; });
            persist();
            renderTracker();
          }
        })
      ]));
      body.appendChild(tr);
    });

    $('trackerEmpty').hidden = rows.length > 0;
    $('trackerTable').hidden = rows.length === 0;
    if (rows.length === 0) {
      $('trackerEmpty').textContent = state.applications.length
        ? 'Nothing in this view. Good news, arguably.'
        : 'No applications yet. Compose one and hit “Log this application”.';
    }
  }

  function renderDash() {
    var dash = $('dash');
    dash.textContent = '';
    dash.appendChild(el('div', { class: 'stat' }, [
      el('b', { text: String(state.applications.length) }),
      el('span', { text: 'total' })
    ]));
    STATUSES.forEach(function (s) {
      var n = state.applications.filter(function (a) { return a.status === s.value; }).length;
      if (!n) return;
      dash.appendChild(el('div', { class: 'stat' }, [
        el('b', { class: s.cls, text: String(n) }),
        el('span', { text: s.label })
      ]));
    });
    $('cntFollow').textContent = state.applications.filter(isFollowUpDue).length;
    $('cntAction').textContent = state.applications.filter(needsAction).length;
    $('tabCount').textContent = state.applications.length;
  }

  function renderTracker() { renderDash(); renderTrackerRows(); }

  /* ------------------------------------------------------ profile+templates */

  function renderProfile() {
    document.querySelectorAll('[data-profile]').forEach(function (input) {
      var key = input.getAttribute('data-profile');
      input.value = key === 'skills' ? (state.profile.skills || []).join('\n') : (state.profile[key] || '');
    });
  }

  function readProfile() {
    document.querySelectorAll('[data-profile]').forEach(function (input) {
      var key = input.getAttribute('data-profile');
      if (key === 'skills') {
        state.profile.skills = input.value.split('\n').map(function (s) { return s.trim(); })
          .filter(function (s) { return s !== ''; });
      } else {
        state.profile[key] = input.value;
      }
    });
    persist();
    renderPreview();
  }

  function renderTemplateEditor() {
    var id = $('tplPick').value;
    var t = state.templates.filter(function (x) { return x.id === id; })[0];
    editingTemplateId = t ? t.id : null;
    $('tplId').value = t ? t.id : '';
    $('tplName').value = t ? t.name : '';
    $('tplSubject').value = t ? t.subject : '';
    $('tplBody').value = t ? t.body : '';
    $('btnDeleteTemplate').disabled = !t;
  }

  function saveTemplateEdits() {
    if (!editingTemplateId) return;
    var t = state.templates.filter(function (x) { return x.id === editingTemplateId; })[0];
    if (!t) return;

    var newId = $('tplId').value.trim().replace(/\s+/g, '-');
    if (newId && newId !== t.id) {
      if (state.templates.some(function (x) { return x.id === newId; })) {
        toast('That id is already used.');
        $('tplId').value = t.id;
      } else {
        var oldId = t.id;
        t.id = newId;
        state.applications.forEach(function (a) { if (a.templateId === oldId) a.templateId = newId; });
        editingTemplateId = newId;
      }
    }
    t.name = $('tplName').value.trim() || t.id;
    t.subject = $('tplSubject').value;
    t.body = $('tplBody').value;

    persist();
    renderTemplatePickers();
    renderPreview();
    renderTrackerRows();
  }

  function newTemplate() {
    var n = state.templates.length + 1;
    var id = 'custom-' + n;
    while (state.templates.some(function (t) { return t.id === id; })) { n++; id = 'custom-' + n; }
    state.templates.push({
      id: id,
      name: 'New template',
      subject: 'Application - {{role}}',
      body: 'Hello {{company}} team,\n\nI\'m {{name}}. {{why}}\n\n{{skills}}\n\nBest regards,\n{{name}}\n{{phone}} · {{userEmail}}'
    });
    persist();
    renderTemplatePickers();
    $('tplPick').value = id;
    renderTemplateEditor();
    toast('Template ' + id + ' created.');
  }

  function deleteTemplate() {
    if (!editingTemplateId) return;
    if (state.templates.length === 1) { toast('Keep at least one template.'); return; }
    if (!confirm('Delete template “' + editingTemplateId + '”? Logged applications keep the id as a label.')) return;
    state.templates = state.templates.filter(function (t) { return t.id !== editingTemplateId; });
    editingTemplateId = null;
    persist();
    renderTemplatePickers();
    renderTemplateEditor();
    renderPreview();
    renderTrackerRows();
  }

  function restoreDefaultTemplates() {
    if (!confirm('Restore the 3 default templates? Your custom templates are kept; same-id defaults are overwritten.')) return;
    window.CL_TEMPLATES.forEach(function (def) {
      var existing = state.templates.filter(function (t) { return t.id === def.id; })[0];
      if (existing) { existing.name = def.name; existing.subject = def.subject; existing.body = def.body; }
      else state.templates.push(JSON.parse(JSON.stringify(def)));
    });
    persist();
    renderTemplatePickers();
    renderTemplateEditor();
    renderPreview();
    toast('Default templates restored.');
  }

  /* ------------------------------------------------------------------ theme */

  var THEME_KEY = 'careerlauncher-theme';
  var THEME_ORDER = ['auto', 'light', 'dark'];
  var THEME_LABEL = { auto: 'follow system', light: 'light', dark: 'dark' };
  var THEME_ICON = {
    auto: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5a8.5 8.5 0 0 0 0 17z" fill="currentColor" stroke="none"/>',
    light: '<path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1.1 1.1M17.3 17.3l1.1 1.1M18.4 5.6l-1.1 1.1M6.7 17.3l-1.1 1.1"/><circle cx="12" cy="12" r="4"/>',
    dark: '<path d="M20.5 14.8A8.5 8.5 0 0 1 9.2 3.5a8.5 8.5 0 1 0 11.3 11.3Z"/>'
  };

  function storedTheme() {
    try { return localStorage.getItem(THEME_KEY) || 'auto'; } catch (e) { return 'auto'; }
  }

  function prefersDark() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyTheme(mode) {
    var root = document.documentElement;
    if (mode === 'auto') delete root.dataset.theme;
    else root.dataset.theme = mode;

    try {
      if (mode === 'auto') localStorage.removeItem(THEME_KEY);
      else localStorage.setItem(THEME_KEY, mode);
    } catch (e) { /* private mode */ }

    $('themeIcon').innerHTML = THEME_ICON[mode];
    $('btnTheme').title = 'Theme: ' + THEME_LABEL[mode];

    // Keep the phone's status bar in step with the page.
    var dark = mode === 'dark' || (mode === 'auto' && prefersDark());
    $('themeColor').setAttribute('content', dark ? '#16181c' : '#f6f6f3');
  }

  function initTheme() {
    applyTheme(storedTheme());
    $('btnTheme').addEventListener('click', function () {
      var next = THEME_ORDER[(THEME_ORDER.indexOf(storedTheme()) + 1) % THEME_ORDER.length];
      applyTheme(next);
      toast('Theme: ' + THEME_LABEL[next] + '.');
    });
    if (!window.matchMedia) return;
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onChange = function () { if (storedTheme() === 'auto') applyTheme('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', onChange);
    else if (mq.addListener) mq.addListener(onChange);
  }

  /* ---------------------------------------------------------------- storage */

  /**
   * Three surfaces, deliberately unequal:
   *   the account chip - always there, one glance, no reading
   *   the alert bar    - only when something actually needs the user
   *   the data card    - the whole story, in Profile, when they go looking
   */
  function renderStorage(st) {
    var supported = window.CLStorage.supportsFS();
    var fileAttached = !!st.fileName;

    $('btnSignIn').hidden = !st.cloudAvailable || st.mode === 'cloud';
    $('btnAccount').hidden = st.mode !== 'cloud';

    if (st.mode === 'cloud') {
      $('accountLabel').textContent = st.user.email || st.user.name || 'Account';
      $('syncDot').className = 'dot' +
        (st.error ? ' is-error' : ((st.offline || st.saving || st.pending) ? ' is-busy' : ''));
      $('btnAccount').title =
        st.error ? 'Sync error: ' + st.error
        : st.offline ? 'Offline — your changes are queued'
        : (st.saving || st.pending) ? 'Syncing…'
        : 'Synced on every device';
    }

    var alert = '';
    var isError = false;
    if (st.configBroken) {
      alert = 'app/config.js failed to load — open your browser console for the syntax error. ' +
              'Running in browser-only mode until it is fixed.';
      isError = true;
    } else if (st.error) {
      alert = 'Sync error: ' + st.error;
      isError = true;
    } else if (st.needsPermission) {
      alert = 'Click “Reconnect file” to keep saving to ' + st.pendingName + '.';
    } else if (st.mode === 'local') {
      alert = st.cloudAvailable
        ? 'Your data lives in this browser only. Sign in to sync it to your phone and every other device.'
        : supported
          ? 'Your data lives in this browser only. Create a data file, or export regularly to back it up.'
          : 'This browser has no File System Access API — your data lives here only. Export regularly to back it up.';
    }
    $('storageBar').hidden = !alert;
    $('storageBar').classList.toggle('is-error', isError);
    $('storageText').textContent = alert;
    $('btnReconnect').hidden = !st.needsPermission;

    $('dataStatus').textContent =
      st.mode === 'cloud'
        ? '☁ Synced to ' + (st.user.email || 'your account') + '. Your account is the source of truth; ' +
          'this browser keeps an offline copy so the app still works without a network.'
        : st.mode === 'file'
          ? '💾 Every change is written to ' + st.fileName + ' on your disk' +
            (st.saving ? ' — saving…' : '.')
          : '⚠ Browser storage only. Nothing leaves this browser, and nothing survives clearing it.';

    $('btnCreateFile').hidden = !supported || fileAttached || st.mode === 'cloud';
    $('btnOpenFile').hidden = !supported || fileAttached || st.mode === 'cloud';
  }

  /**
   * Swap the whole state under the UI. A remote change can land while someone
   * is typing, so put the caret back where it was.
   */
  function adoptState(raw) {
    var active = document.activeElement;
    var key = active && active.getAttribute ? active.getAttribute('data-key') : null;
    var id = active && active.id ? active.id : null;
    var caret = null;
    try { caret = active && 'selectionStart' in active ? active.selectionStart : null; }
    catch (e) { caret = null; }

    state = normalize(raw);
    renderProfile();
    renderTemplatePickers();
    renderTemplateEditor();
    renderTracker();
    renderPreview();

    var again = key ? document.querySelector('[data-key="' + key + '"]') : (id ? $(id) : null);
    if (!again) return;
    again.focus();
    try { if (caret !== null && again.setSelectionRange) again.setSelectionRange(caret, caret); }
    catch (e) { /* selectionStart is not settable on every input type */ }
  }

  /* ------------------------------------------------------------------ modals */

  function openModal(id) {
    $(id).hidden = false;
    document.body.classList.add('modal-open');
  }

  function closeModal(id) {
    $(id).hidden = true;
    if (!document.querySelector('.modal:not([hidden])')) document.body.classList.remove('modal-open');
  }

  var pendingMerge = null; // resolver for the "both sides have data" dialog

  function askMerge(localState, cloudState) {
    return new Promise(function (resolve) {
      $('mergeSummary').textContent =
        'This browser holds ' + localState.applications.length + ' application(s); ' +
        'your account holds ' + cloudState.applications.length + '.';
      pendingMerge = resolve;
      openModal('mergeModal');
    });
  }

  function answerMerge(choice) {
    var resolve = pendingMerge;
    pendingMerge = null;
    closeModal('mergeModal');
    if (resolve) resolve(choice);
  }

  function authMessage(error) {
    var e = $('authError');
    e.hidden = !error;
    e.textContent = error ? '⚠ ' + error : '';
  }

  function runAuth(factory) {
    var button = $('btnSignInEmail');
    button.disabled = true;
    authMessage('');
    var p;
    try { p = factory(); } catch (err) { p = Promise.reject(err); }
    Promise.resolve(p).then(function () {
      closeModal('authModal');
    }).catch(function (err) {
      authMessage(err && err.message ? err.message : String(err));
    }).then(function () {
      button.disabled = false;
    });
  }

  function credentials() {
    return { email: $('authEmail').value.trim(), password: $('authPassword').value };
  }

  function initStore() {
    window.CLStore.init({
      getState: function () { return state; },
      normalize: normalize,
      onState: function (next) { adoptState(next); },
      onStatus: renderStorage,
      askMerge: askMerge,
      toast: toast
    });
  }

  /* ------------------------------------------------------------------ wiring */

  function switchScreen(name) {
    closePreviewSheet();
    document.querySelectorAll('.screen').forEach(function (s) {
      s.classList.toggle('is-active', s.id === 'screen-' + name);
    });
    document.querySelectorAll('.tab').forEach(function (t) {
      t.classList.toggle('is-active', t.getAttribute('data-screen') === name);
    });
    window.scrollTo(0, 0);
  }

  /* On a phone the letter is a sheet over the form; on a desktop it is simply
     always visible and these two are no-ops. */
  function openPreviewSheet() { document.body.classList.add('preview-open'); }
  function closePreviewSheet() { document.body.classList.remove('preview-open'); }

  function wire() {
    $('tabs').addEventListener('click', function (e) {
      var tab = e.target.closest ? e.target.closest('.tab') : null;
      if (tab) switchScreen(tab.getAttribute('data-screen'));
    });

    // Compose
    $('companySearch').addEventListener('input', renderCompanyList);
    $('btnClearCompany').addEventListener('click', clearCompany);
    $('btnUpdateData').addEventListener('click', updateData);
    $('btnUseManual').addEventListener('click', useManualCompany);
    $('templatePick').addEventListener('change', renderPreview);
    $('roleInput').addEventListener('input', renderPreview);
    $('whyInput').addEventListener('input', renderPreview);
    $('btnSeedWhy').addEventListener('click', seedWhy);
    $('btnCopyAll').addEventListener('click', function () {
      copyText('Subject: ' + $('previewSubject').value + '\n\n' + $('previewBody').value, 'Subject + body');
    });
    $('btnCopyBody').addEventListener('click', function () {
      copyText($('previewBody').value, 'Body');
    });
    $('btnLog').addEventListener('click', function () {
      logApplication();
      closePreviewSheet();
    });
    $('btnShowPreview').addEventListener('click', openPreviewSheet);
    $('btnHidePreview').addEventListener('click', closePreviewSheet);

    // Tracker
    $('viewFilters').addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('button[data-view]') : null;
      if (!btn) return;
      currentView = btn.getAttribute('data-view');
      document.querySelectorAll('#viewFilters button').forEach(function (b) {
        b.classList.toggle('is-active', b === btn);
      });
      renderTrackerRows();
    });
    $('btnAddRow').addEventListener('click', function () {
      var sent = todayISO();
      state.applications.unshift({
        id: uid(), company: '', email: '', role: '', templateId: '',
        dateSent: sent, status: 'pending', responseDate: null, notes: '',
        followUpOn: addDaysISO(sent, FOLLOWUP_DAYS),
        createdAt: new Date().toISOString()
      });
      sortApplications(state.applications);
      currentView = 'all';
      document.querySelectorAll('#viewFilters button').forEach(function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-view') === 'all');
      });
      persist();
      renderTracker();
    });
    $('btnExportCSV').addEventListener('click', function () {
      window.CLStorage.exportCSV(state.applications, templateName);
      toast('CSV exported.');
    });

    // Profile & templates
    document.querySelectorAll('[data-profile]').forEach(function (input) {
      input.addEventListener('input', readProfile);
    });
    $('tplPick').addEventListener('change', renderTemplateEditor);
    ['tplId', 'tplName', 'tplSubject', 'tplBody'].forEach(function (id) {
      $(id).addEventListener('change', saveTemplateEdits);
      if (id === 'tplBody' || id === 'tplSubject') $(id).addEventListener('input', saveTemplateEdits);
    });
    $('btnNewTemplate').addEventListener('click', newTemplate);
    $('btnDeleteTemplate').addEventListener('click', deleteTemplate);
    $('btnResetTemplates').addEventListener('click', restoreDefaultTemplates);

    // Storage bar
    $('btnCreateFile').addEventListener('click', function () {
      window.CLStorage.createFile(state).then(function (loaded) {
        if (loaded) { adoptState(loaded); toast('Opened your existing data file.'); }
        else toast('Data file created - every change is saved to it now.');
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        toast('Could not create the file: ' + (err.message || err));
      });
    });
    $('btnOpenFile').addEventListener('click', function () {
      window.CLStorage.openFile().then(function (loaded) {
        if (loaded) { adoptState(loaded); toast('Data file loaded.'); }
        else { persist(); toast('That file was empty - it now holds your current data.'); }
      }).catch(function (err) {
        if (err && err.name === 'AbortError') return;
        toast('Could not open the file: ' + (err.message || err));
      });
    });
    $('btnReconnect').addEventListener('click', function () {
      window.CLStorage.reconnectFile().then(function (loaded) {
        if (loaded) adoptState(loaded);
        toast('Reconnected.');
      }).catch(function (err) { toast('Reconnect failed: ' + (err.message || err)); });
    });
    $('btnExportJSON').addEventListener('click', function () {
      window.CLStorage.exportJSON(state);
      toast('JSON exported.');
    });
    // Sign-in dialog
    $('btnSignIn').addEventListener('click', function () {
      var project = window.CL_CONFIG && window.CL_CONFIG.firebase && window.CL_CONFIG.firebase.projectId;
      if (project) $('authProject').textContent = 'the “' + project + '”';
      authMessage('');
      openModal('authModal');
      $('authEmail').focus();
    });
    $('btnAuthClose').addEventListener('click', function () { closeModal('authModal'); });
    $('btnSignInEmail').addEventListener('click', function () {
      var c = credentials();
      runAuth(function () { return window.CLStore.signInEmail(c.email, c.password); });
    });
    $('authPassword').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') $('btnSignInEmail').click();
    });

    // Merge dialog
    $('btnMergeBoth').addEventListener('click', function () { answerMerge('merge'); });
    $('btnMergeCloud').addEventListener('click', function () { answerMerge('cloud'); });
    $('btnMergeLocal').addEventListener('click', function () {
      if (!confirm('Everything currently in your account will be replaced by this browser\'s data. Continue?')) return;
      answerMerge('local');
    });

    // Account dialog
    $('btnAccount').addEventListener('click', function () {
      var st = window.CLStore.getStatus();
      $('accountWho').textContent = st.user
        ? 'Signed in as ' + (st.user.email || st.user.name || st.user.uid) + '.'
        : '';
      openModal('accountModal');
    });
    $('btnAccountClose').addEventListener('click', function () { closeModal('accountModal'); });
    $('btnSignOut').addEventListener('click', function () {
      closeModal('accountModal');
      window.CLStore.signOut(false).then(function () { toast('Signed out.'); });
    });
    $('btnSignOutForget').addEventListener('click', function () {
      if (!confirm('Sign out and erase this browser\'s copy of your data? Your account keeps everything.')) return;
      closeModal('accountModal');
      window.CLStore.signOut(true).then(function () { toast('Signed out. This browser is clean.'); });
    });
    $('btnWipeCloud').addEventListener('click', function () {
      if (!confirm('Permanently delete every application, template and profile field stored in your account? This cannot be undone.')) return;
      window.CLStore.wipeCloud().then(function () {
        closeModal('accountModal');
        toast('Your cloud data was deleted.');
      }).catch(function (err) { toast('Delete failed: ' + (err.message || err)); });
    });

    document.querySelectorAll('.modal').forEach(function (m) {
      m.addEventListener('click', function (e) {
        if (e.target !== m || m.id === 'mergeModal') return; // the merge choice is not optional
        closeModal(m.id);
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      ['authModal', 'accountModal'].forEach(function (id) {
        if (!$(id).hidden) closeModal(id);
      });
      closePreviewSheet();
    });

    $('btnImportJSON').addEventListener('click', function () { $('importInput').click(); });
    $('importInput').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      window.CLStorage.importJSON(file).then(function (raw) {
        if (!raw || !Array.isArray(raw.applications)) throw new Error('not a CareerLauncher data file');
        if (state.applications.length &&
            !confirm('Replace your current ' + state.applications.length + ' application(s) with the imported file?')) return;
        adoptState(raw);
        persist();
        toast('Imported ' + raw.applications.length + ' application(s).');
      }).catch(function (err) {
        toast('Import failed: ' + (err.message || err));
      });
      e.target.value = '';
    });

    window.addEventListener('beforeunload', function () { window.CLStore.flush(); });
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') window.CLStore.flush();
    });
  }

  /* Offline shell, and the "Add to home screen" prompt on phones. */
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    if (location.protocol === 'file:') return;
    navigator.serviceWorker.register('sw.js').catch(function () { /* not fatal */ });
  }

  /* -------------------------------------------------------------------- boot */

  function boot() {
    initTheme();
    state = normalize(window.CLStorage.loadLocal());

    var cached = window.CLStorage.cachedCompanies();
    if (cached && Array.isArray(cached.rows) && cached.rows.length) {
      companiesFetchedAt = cached.fetchedAt;
      setCompanies(cached.rows);
    } else {
      setCompanies(window.CL_SEED_COMPANIES || []);
    }

    wire();
    renderProfile();
    renderTemplatePickers();
    renderTemplateEditor();
    renderTracker();
    renderPreview();
    initStore();
    registerServiceWorker();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
