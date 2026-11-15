import Link from "next/link"
import Image from "next/image"
import { HeroScene } from "@/components/landing/hero-scene"
import { ScrollStory } from "@/components/landing/scroll-story"
import { ArrowDownRight, ArrowUpRight, BookOpenText, FileSearch, Layers3, Scale, Sparkles } from "lucide-react"
import styles from "./landing.module.css"

export default function Page() {
  return (
    <main className={styles.page}><div className={styles.shell}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}><span className={styles.brandMark}>a<span>.</span></span><span>accountant<span className={styles.brandAi}>ai</span></span></Link>
        <nav aria-label="Navigation principale" className={styles.nav}><a href="#capabilities">Capacités</a><a href="#approach">Notre approche</a><Link href="/workspace">Connexion</Link></nav>
        <Link className={styles.navCta} href="/signup">Créer un compte <ArrowUpRight size={16}/></Link>
      </header>
      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <div className={styles.availability}><span /> L’intelligence au service de votre cabinet</div>
          <h1>La comptabilité<br/><em>prend une</em><br/>autre dimension.</h1>
          <p>Un agent IA pensé pour les professionnels du chiffre. Explorez vos questions comptables, fiscales et juridiques avec plus de clarté.</p>
          <div className={styles.actions}><Link href="/signup" className={styles.primary}>Commencer maintenant <ArrowUpRight size={18}/></Link><a href="#capabilities" className={styles.secondary}>Découvrir l’agent <ArrowDownRight size={18}/></a></div>
          <div className={styles.heroFoot}><span className={styles.avatar}>✳</span><span>Conçu pour la pratique comptable<br/><strong>et fiscale marocaine.</strong></span></div>
        </div>
        <div className={styles.visual} aria-hidden="true"><div className={styles.scene}><Image className={styles.heroImage} src="/fintech-core-v1.png" alt="" fill priority sizes="(max-width: 800px) 100vw, 50vw"/><HeroScene/><div className={styles.floatTop}><span className={styles.tinyIcon}><Sparkles size={15}/></span><span>Intelligence en action<small>Analyse · Recherche · Synthèse</small></span><b>↗</b></div><div className={styles.floatBottom}><span className={styles.dot}/><span>Votre expertise, augmentée<small>Un nouvel espace de travail</small></span></div></div><span className={styles.visualLabel}>ACCOUNTANT AI / INTELLIGENCE EN ACTION</span></div>
      </section>
      <div className={styles.strip}><span>UNE NOUVELLE FAÇON DE TRAVAILLER</span><div>Comptabilité <i>✳</i> Fiscalité <i>✳</i> Recherche juridique <i>✳</i> Documents</div></div>
      <section className={styles.capabilities} id="capabilities"><div className={styles.sectionHeading}><div><span className={styles.kicker}>Pensé pour votre quotidien</span><h2>Plus de contexte.<br/><em>De meilleures perspectives.</em></h2></div><p>Des questions complexes aux documents clients, retrouvez les éléments utiles pour avancer avec confiance.</p></div><div className={styles.featureGrid}>
        <article><div className={styles.featureIcon}><FileSearch size={22}/></div><h3>Vos documents, éclairés</h3><p>Interrogez vos documents et faites ressortir les informations pertinentes pour votre dossier.</p><span>Analyse documentaire</span></article>
        <article><div className={styles.featureIcon}><BookOpenText size={22}/></div><h3>La recherche à vos côtés</h3><p>Explorez les sujets de TVA, d’IS, d’écritures comptables et de lois de finances marocaines.</p><span>Comptabilité & fiscalité</span></article>
        <article><div className={styles.featureIcon}><Scale size={22}/></div><h3>Le contexte réglementaire</h3><p>Abordez les questions juridiques et fiscales avec des outils de recherche adaptés à votre pratique.</p><span>Recherche juridique</span></article>
      </div></section>
      <ScrollStory />
      <section className={styles.approach} id="approach"><div><span className={styles.kicker}>Sous le capot</span><h2>Une intelligence qui travaille<br/><em>avec votre expertise.</em></h2></div><div className={styles.approachContent}><p>Accountant AI réunit recherche, contexte et raisonnement dans une expérience conçue pour les professionnels du chiffre.</p><div className={styles.techRow}><Layers3 size={22}/><div><strong>DeepAgent & Harness Agent</strong><span>Une approche agentique pour accompagner les tâches complexes.</span></div></div><div className={styles.techRow}><span className={styles.qb}>qb</span><div><strong>QuickBooks</strong><span>Intégration envisagée pour connecter davantage votre flux de travail.</span></div><small>À venir</small></div></div></section>
      <section className={styles.finalCta}><span>Votre prochain chapitre commence ici.</span><h2>Donnez de l’espace<br/><em>à votre expertise.</em></h2><Link href="/signup" className={styles.primary}>Créer mon compte <ArrowUpRight size={18}/></Link></section>
      <footer className={styles.footer}><Link href="/" className={styles.footerBrand}>accountant<span>ai</span></Link><p>Un nouvel espace pour les professionnels du chiffre.</p><Link href="/workspace">Accéder à mon espace <ArrowUpRight size={15}/></Link></footer>
    </div></main>
  )
}
