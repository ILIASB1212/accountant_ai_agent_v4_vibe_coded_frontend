"use client"

import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, FileText, FolderOpen, MessageSquare, Sparkles } from "lucide-react"
import Link from "next/link"
import styles from "./scroll-story.module.css"

const chapters = [
  { number: "01", title: "Vos dossiers, en ordre.", text: "Créez un espace pour chaque client et retrouvez les conversations liées à son dossier.", icon: FolderOpen },
  { number: "02", title: "Vos documents prennent la parole.", text: "Joignez une facture ou un document PDF, vérifiez le texte extrait et posez votre question.", icon: FileText },
  { number: "03", title: "Une réponse, avec du contexte.", text: "Explorez les règles comptables et fiscales marocaines, puis approfondissez dans la même conversation.", icon: MessageSquare },
]

export function ScrollStory() {
  const section = useRef<HTMLElement>(null)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const host = section.current
    if (!host) return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    let frame = 0
    const update = () => {
      frame = 0
      const articles = host.querySelectorAll<HTMLElement>("[data-chapter]")
      let closest = 0
      let distance = Infinity
      articles.forEach((article, index) => {
        const box = article.getBoundingClientRect()
        const next = Math.abs(box.top + box.height / 2 - window.innerHeight / 2)
        if (next < distance) { distance = next; closest = index }
      })
      setActive(closest)
    }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    const sync = () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
      if (!media.matches) {
        window.addEventListener("scroll", onScroll, { passive: true })
        window.addEventListener("resize", onScroll)
        update()
      } else setActive(0)
    }
    media.addEventListener("change", sync)
    sync()
    return () => { media.removeEventListener("change", sync); window.removeEventListener("scroll", onScroll); window.removeEventListener("resize", onScroll); cancelAnimationFrame(frame) }
  }, [])

  return <section className={styles.story} ref={section} aria-labelledby="story-title">
    <div className={styles.intro}><span>Une nouvelle façon de travailler</span><h2 id="story-title">Tout votre travail.<br/><em>Un seul fil.</em></h2><p>Du premier document à la prochaine question, votre cabinet avance avec le contexte à portée de main.</p></div>
    <div className={styles.layout}>
      <div className={styles.chapters}>{chapters.map((chapter, index) => <article className={styles.chapter} data-chapter key={chapter.number}><div className={styles.chapterInner}><span className={styles.chapterNumber}>{chapter.number} / 03</span><h3>{chapter.title}</h3><p>{chapter.text}</p><div className={styles.progress}><span style={{ width: `${index <= active ? 100 : 0}%` }} /></div>{index === 2 && <Link href="/signup" className={styles.link}>Créer mon compte <ArrowUpRight size={18}/></Link>}</div></article>)}</div>
      <div className={styles.sticky} aria-hidden="true"><div className={styles.orb}/><div className={styles.stage} data-step={active}>
        <div className={styles.frame}><div className={styles.frameTop}><span className={styles.mark}>a.</span><strong>accountant<span>ai</span></strong><div className={styles.frameDots}><i/><i/><i/></div></div><div className={styles.frameBody}><div className={styles.sidebar}><span>ESPACE CABINET</span><b>⌂</b><b>▤</b><b>◇</b></div><div className={styles.screen}>
          <div className={`${styles.screenPanel} ${styles.clients}`}><span className={styles.screenLabel}>Dossiers clients</span><h4>Bonjour, votre espace est prêt.</h4><div className={styles.folder}><FolderOpen size={21}/><div><strong>Atlas Conseil</strong><small>Dossier client</small></div><span>↗</span></div><div className={styles.folder}><FolderOpen size={21}/><div><strong>Maison Salma</strong><small>Dossier client</small></div><span>↗</span></div></div>
          <div className={`${styles.screenPanel} ${styles.documents}`}><span className={styles.screenLabel}>Document ajouté</span><h4>Donnez du contexte à votre question.</h4><div className={styles.file}><FileText size={24}/><div><strong>Facture client.pdf</strong><small>Texte extrait · Prêt à vérifier</small></div><span>✓</span></div><div className={styles.lines}><i/><i/><i/><i/></div></div>
          <div className={`${styles.screenPanel} ${styles.answer}`}><span className={styles.screenLabel}>Conversation</span><h4>Une question, une piste claire.</h4><div className={styles.question}>Comment traiter la TVA sur cette facture ?</div><div className={styles.response}><Sparkles size={19}/><div><strong>Accountant AI</strong><p>Examinons la facture et les éléments à vérifier pour votre dossier.</p><div className={styles.lines}><i/><i/><i/></div></div></div></div>
        </div></div></div><div className={styles.floatingTag}><Sparkles size={16}/><span>Votre contexte, à chaque étape</span></div></div><div className={styles.caption}>PENSÉ POUR LES PROFESSIONNELS DU CHIFFRE</div></div>
    </div>
  </section>
}
