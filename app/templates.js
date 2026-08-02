/* templates.js — the seed template library.
 * These are the three files in ../templates/ converted to {{token}} form.
 * The user can edit, add to, or delete them; their copies live in their data file.
 */
(function (root) {
  'use strict';

  root.CL_TEMPLATES = [
    {
      id: 'spontaneous',
      name: 'Spontaneous application',
      subject: 'Spontaneous application — {{role}}',
      body: [
        'Hello {{company}} team,',
        '',
        'My name is {{name}}, a {{role}}. I\'m reaching out because {{why}}',
        '',
        'I\'d love to contribute to your team. In short, my background includes:',
        '',
        '{{skills}}',
        '',
        'I\'ve attached my CV and would welcome the chance to talk about how I could add value — even if there\'s no formal opening right now. You can also see my work here: {{portfolio}}',
        '',
        'Thank you for your time and consideration.',
        '',
        'Best regards,',
        '{{name}}',
        '{{phone}} · {{userEmail}} · {{linkedin}}'
      ].join('\n')
    },
    {
      id: 'internship',
      name: 'Internship application',
      subject: 'Internship application — {{role}}',
      body: [
        'Hello {{company}} team,',
        '',
        'I\'m {{name}}, a {{role}}. I\'m looking for an internship, and {{company}} is at the top of my list because {{why}}',
        '',
        'A bit about what I bring:',
        '',
        '{{skills}}',
        '',
        'My CV is attached, and I\'d be glad to share more or complete any assessment. Thank you for considering my application — I\'d be thrilled to learn from your team.',
        '',
        'Warm regards,',
        '{{name}}',
        '{{phone}} · {{userEmail}} · {{linkedin}} · {{github}}'
      ].join('\n')
    },
    {
      id: 'follow-up',
      name: 'Follow-up (after ~1 week)',
      subject: 'Re: Application — {{role}}',
      body: [
        'Hello {{company}} team,',
        '',
        'I hope you\'re doing well. I wanted to gently follow up on my earlier message regarding a {{role}} opportunity. I remain very interested in contributing to {{company}} — {{why}}',
        '',
        'If it\'s helpful, I\'m happy to share more about my background or answer any questions. My CV is attached again for convenience.',
        '',
        'Thank you very much for your time.',
        '',
        'Best regards,',
        '{{name}}',
        '{{phone}} · {{userEmail}} · {{linkedin}}'
      ].join('\n')
    }
  ];
})(window);
