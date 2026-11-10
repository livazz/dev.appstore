import { describe, expect, it } from 'vitest';
import { reportDecisionEmail, reportReceivedEmail } from './index';

const ctx = { appUrl: 'https://devappstore.example', supportEmail: 'support@devappstore.example', companyName: 'Dev AppStore SAS', timeZone: 'Europe/Paris' };
const XSS = `<script>alert("x")</script>`;

describe('e-mails de signalement', () => {
  it('accusé de réception : référence, cible, catégorie, explication, bonne foi et lien vers la charte', () => {
    const m = reportReceivedEmail(
      {
        reportId: 'rpt_123',
        gameName: 'Crystal Clash',
        itemTitle: 'Sac de gemmes',
        categoryLabel: 'Contenu illicite ou trompeur',
        explanation: `Prix fictif ${XSS}`,
        receivedAt: new Date('2026-11-10T10:00:00Z'),
        goodFaithLabel: 'Je déclare de bonne foi…',
      },
      ctx,
    );
    expect(m.subject).toBe('Accusé de réception de votre signalement : Sac de gemmes (Crystal Clash)');
    for (const s of ['rpt_123', 'Contenu illicite ou trompeur', 'Je déclare de bonne foi…', '2026-11-10T10:00:00']) expect(m.text).toContain(s);
    expect(m.html).toContain('https://devappstore.example/legal/cgu-studios#contenus-interdits');
    expect(m.html).not.toContain('<script>');
  });

  it('décision : classement sans suite ou suspension, avec le motif et la voie de contestation', () => {
    const base = {
      reportId: 'rpt_9',
      gameName: 'Pixel Farm',
      categoryLabel: 'Autre',
      reportedAt: new Date('2026-11-01T08:00:00Z'),
      reason: `Aucun manquement constaté ${XSS}`,
      decidedAt: new Date('2026-11-02T08:00:00Z'),
    };
    const dismissed = reportDecisionEmail({ ...base, decision: 'dismissed' }, ctx);
    expect(dismissed.subject).toMatch(/classé sans suite$/);
    expect(dismissed.text).toContain('Aucun manquement constaté');
    expect(dismissed.text).toContain('rpt_9');
    expect(dismissed.html).not.toContain('<script>');

    const actioned = reportDecisionEmail({ ...base, decision: 'actioned', groundLabel: 'Fraude ou paiements suspects' }, ctx);
    expect(actioned.subject).toMatch(/jeu suspendu$/);
    expect(actioned.text).toContain('Fraude ou paiements suspects');
    expect(actioned.text).toContain('support@devappstore.example');
  });
});
