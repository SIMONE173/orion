import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Informativa sulla privacy — ORION",
  description: "Come ORION raccoglie, usa e protegge i dati.",
};

const aggiornato = "18 giugno 2026";

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <a href="/" className="text-sm text-cyan-300/80 hover:text-cyan-200">← Torna a ORION</a>
      <h1 className="mt-6 text-3xl font-semibold text-slate-50">Informativa sulla privacy</h1>
      <p className="mt-2 text-sm text-slate-400">Ultimo aggiornamento: {aggiornato}</p>

      <div className="mt-8 space-y-6 leading-relaxed text-slate-300">
        <section>
          <h2 className="text-xl font-semibold text-slate-100">Chi siamo</h2>
          <p className="mt-2">
            ORION è un assistente operativo per professionisti: aiuta a gestire agenda, clienti,
            promemoria, comunicazioni e documenti tramite un&apos;interfaccia conversazionale.
            Il titolare del trattamento è il fornitore di ORION, contattabile all&apos;indirizzo
            indicato in fondo a questa pagina.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Quali dati trattiamo</h2>
          <ul className="mt-2 list-disc space-y-1 pl-6">
            <li><strong>Dati dell&apos;account</strong>: email e password (cifrata) del professionista.</li>
            <li><strong>Dati operativi</strong>: agenda, anagrafiche clienti, pagamenti, note, promemoria, documenti caricati dal professionista.</li>
            <li><strong>Comunicazioni WhatsApp</strong>: se il professionista collega il proprio numero WhatsApp Business, i messaggi scambiati con i suoi clienti transitano tramite le API di Meta per essere gestiti dentro ORION.</li>
            <li><strong>Dati tecnici</strong>: log essenziali al funzionamento e alla sicurezza del servizio.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Come usiamo i dati</h2>
          <p className="mt-2">
            I dati sono usati esclusivamente per fornire il servizio: mostrare e organizzare le
            informazioni del professionista, inviare e ricevere comunicazioni per suo conto,
            generare promemoria e analisi. Ogni professionista (tenant) ha uno spazio dati
            <strong> isolato</strong>: i dati di un account non sono mai accessibili ad altri account.
            Non vendiamo i dati e non li usiamo per profilazione pubblicitaria.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">WhatsApp e Meta</h2>
          <p className="mt-2">
            Il collegamento del numero WhatsApp avviene tramite l&apos;Embedded Signup di Meta: è il
            professionista a effettuare l&apos;accesso e a concedere il consenso. ORION riceve un token
            per gestire i messaggi del suo account WhatsApp Business. Il trattamento dei dati da parte
            di Meta è regolato dalle policy di Meta/WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Conservazione e sicurezza</h2>
          <p className="mt-2">
            I dati sono conservati per il tempo necessario all&apos;erogazione del servizio e cancellati
            su richiesta dell&apos;utente o alla chiusura dell&apos;account. Adottiamo misure tecniche per
            proteggerli (password cifrate, accesso isolato per account, trasmissione su HTTPS).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">I tuoi diritti</h2>
          <p className="mt-2">
            In conformità al GDPR puoi richiedere accesso, rettifica, cancellazione o portabilità dei
            tuoi dati, e opporti al trattamento. Per esercitare questi diritti scrivici all&apos;indirizzo
            qui sotto.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Contatti</h2>
          <p className="mt-2">
            Per qualsiasi richiesta relativa alla privacy: {" "}
            <a href="mailto:simone07intake@gmail.com" className="text-cyan-300 hover:text-cyan-200">
              simone07intake@gmail.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
