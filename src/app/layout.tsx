import type { Metadata } from "next";
import { Fustat } from "next/font/google";
import "./globals.css";

const fustat = Fustat({
  variable: "--font-fustat",
  subsets: ["latin"],
});

const brandName = process.env.NEXT_PUBLIC_BRAND_NAME || "Squad.com";

export const metadata: Metadata = {
  title: `CRM ${brandName}`,
  description: `Gestão comercial do time ${brandName}`,
  /**
   * O Google Tradutor fica de fora.
   *
   * Ele substitui nós de texto por conta própria, e o React perde a referência
   * dos que ele mesmo criou: a página quebra com "Failed to execute
   * removeChild on Node" — sempre numa tela que re-renderiza muito, que é
   * exatamente a sala de reunião. A dica veio do CRM de referência, que
   * carrega a mesma marcação e o mesmo comentário; não é um problema que se
   * descubra testando, só ao vivo com o tradutor ligado.
   */
  other: { google: "notranslate" },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" translate="no" className={`${fustat.variable} h-full antialiased notranslate`}>
      <body className="min-h-full bg-background text-foreground">{children}</body>
    </html>
  );
}
