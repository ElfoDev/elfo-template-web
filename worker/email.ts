export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Envio de emails transacionais (verificação de email, por enquanto).
 *
 * Ainda sem provedor: só registra a mensagem no log (no `pnpm dev`, aparece no
 * terminal; em produção, nos logs do Worker). Para mandar de verdade, troque o
 * corpo por uma chamada ao provedor escolhido (Resend, Postmark, SES, Cloudflare
 * Email…) usando um secret novo (ex.: `RESEND_API_KEY`; veja "Variáveis de
 * ambiente" no CLAUDE.md) e ligue `REQUIRE_EMAIL_VERIFICATION` em worker/auth.ts.
 */
export async function sendEmail(_env: Env, message: EmailMessage): Promise<void> {
  console.info(`[email] para ${message.to}: ${message.subject}\n${message.text}`);
}
