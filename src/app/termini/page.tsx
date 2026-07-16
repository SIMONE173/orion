import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Termini di servizio — ORION",
  description: "Le condizioni d'uso di ORION.",
};

const aggiornato = "18 giugno 2026";

export default function TerminiPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-slate-200">
      <a href="/" className="text-sm text-cyan-300/80 hover:text-cyan-200">← Torna a ORION</a>
      <h1 className="mt-6 text-3xl font-semibold text-slate-50">Termini di servizio</h1>
      <p className="mt-2 text-sm text-slate-400">Ultimo aggiornamento: {aggiornato}</p>

      <div className="mt-8 space-y-6 leading-relaxed text-slate-300">
        <section>
          <h2 className="text-xl font-semibold text-slate-100">Il servizio</h2>
          <p className="mt-2">
            ORION è un assistente operativo conversazionale che aiuta i professionisti a organizzare
            il proprio lavoro (agenda, clienti, comunicazioni, promemoria, documenti). Usando ORION
            accetti questi termini.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Account e responsabilità</h2>
          <p className="mt-2">
            Sei responsabile della riservatezza delle tue credenziali e dell&apos;uso del tuo account.
            Ti impegni a usare il servizio nel rispetto della legge e dei diritti dei tuoi clienti,
            inclusi consenso e privacy delle comunicazioni che invii tramite ORION.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Uso corretto del servizio (fair use)</h2>
          <p className="mt-2">
            Ogni abbonamento include un uso professionale personale pieno del servizio, senza
            conteggi da tenere a mente. Per garantire a tutti la stessa qualità, gli usi anomali —
            condivisione dell&apos;account tra più persone su un piano individuale, accessi
            automatizzati, o utilizzo del servizio come assistente generico per compiti estranei
            all&apos;attività professionale — possono comportare la proposta di passaggio al piano
            Azienda o l&apos;applicazione di misure correttive concordate. Non sospendiamo mai
            l&apos;accesso per il solo volume di utilizzo professionale.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Uso di WhatsApp</h2>
          <p className="mt-2">
            Collegando il tuo numero WhatsApp Business ti impegni a rispettare le policy di
            Meta/WhatsApp, a inviare messaggi solo a chi ha fornito il consenso e a non inviare
            contenuti vietati o spam. ORION è uno strumento: la responsabilità dei messaggi inviati
            resta del professionista.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Limitazioni</h2>
          <p className="mt-2">
            ORION non fornisce consulenza medica, legale o fiscale: è un supporto organizzativo.
            Il servizio è fornito &quot;così com&apos;è&quot;; pur impegnandoci per affidabilità e continuità,
            non garantiamo l&apos;assenza di interruzioni o errori.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Cessazione</h2>
          <p className="mt-2">
            Puoi chiudere il tuo account in qualsiasi momento. Possiamo sospendere account che
            violano questi termini o le policy di Meta/WhatsApp.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-slate-100">Contatti</h2>
          <p className="mt-2">
            Per domande sui termini: {" "}
            <a href="mailto:simone07intake@gmail.com" className="text-cyan-300 hover:text-cyan-200">
              simone07intake@gmail.com
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
