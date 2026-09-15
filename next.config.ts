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
    // Nada fora da sala precisa de câmera, microfone ou localização. As rotas
    // da sala reabrem as duas primeiras logo abaixo — explicitamente, e só
    // elas.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
];

/**
 * A exceção da sala de reunião.
 *
 * O bloco acima vale para o site inteiro, e é o que deve valer: um CRM não
 * precisa de câmera. Mas ele também alcançava `/sala`, e o navegador negaria o
 * `getUserMedia` sem erro visível — a call simplesmente não abriria, e a causa
 * estaria num cabeçalho, não no código da sala.
 *
 * O Next aplica TODAS as regras que casam, e a última vence para a mesma
 * chave. Por isso esta entrada vem depois da genérica.
 *
 * `self` e não `*`: só a nossa origem. Como o site inteiro já recusa ser
 * embutido (`frame-ancestors 'none'`), não há iframe de terceiro para herdar
 * a permissão.
 */
const salaDeReuniao = [
  {
    key: "Permissions-Policy",
    value:
      "camera=(self), microphone=(self), display-capture=(self), " +
      "geolocation=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  async headers() {
    return [
      { source: "/:path*", headers: seguranca },
      // Depois da genérica, de propósito: ver o comentário em `salaDeReuniao`.
      { source: "/sala/:path*", headers: salaDeReuniao },
      { source: "/convite/:path*", headers: salaDeReuniao },
    ];
  },
};

export default nextConfig;
