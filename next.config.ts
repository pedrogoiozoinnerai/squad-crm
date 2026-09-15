import type { NextConfig } from "next";

/**
 * Cabeçalhos de segurança.
 *
 * A Vercel já devolve HSTS; o resto não vinha de lugar nenhum. Cada um aqui
 * responde a um risco concreto deste CRM, não a uma lista genérica.
 */
const seguranca = [
  {
    // Clickjacking: sem isto, qualquer site pode embutir o CRM num iframe
    // invisível e induzir um vendedor logado a clicar em "Ganho" ou "Excluir"
    // achando que clica noutra coisa. `frame-ancestors` é a forma moderna e
    // funciona onde o X-Frame-Options não alcança.
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  {
    // Impede o navegador de adivinhar o tipo de um arquivo servido por nós —
    // é o que transforma um upload inofensivo em script executável.
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    // O CRM manda o vendedor para fora: wa.me, link de pagamento, site do
    // lead. Sem isto, a URL interna inteira vai junto no cabeçalho Referer —
    // inclusive o `?deal=<id>` — e o destino passa a conhecer identificadores
    // da nossa base. Com `strict-origin`, sai só o domínio.
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Nada aqui precisa de câmera, microfone ou localização hoje. Quando o
    // Meet chegar, câmera e microfone voltam — explicitamente, e só nas rotas
    // da sala.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: seguranca }];
  },
};

export default nextConfig;
