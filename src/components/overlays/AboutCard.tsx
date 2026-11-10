import CloseButton from './CloseButton'
import './overlay.css'
import './about.css'

/** ABOUT —— IVE 收藏身份卡。外层 OverlayHost 继续负责焦点、关闭与转场。 */
export default function AboutCard() {
  return (
    <div className="ov">
      <article className="ive-id" aria-labelledby="ive-id-title">
        <CloseButton />
        <aside className="ive-id__rail" aria-hidden="true">
          <span>i&apos;ve</span>
          <span>2021.12.01</span>
        </aside>

        <header className="ive-id__meta">
          <p>ELEVEN &gt;&gt;&gt;&gt;&gt; The 1st &gt;&gt; Single Album &gt;&gt;&gt;</p>
          <p>&gt;&gt;&gt;&gt;&gt; 2021 &gt;&gt; 12 &gt;&gt;&gt;&gt;&gt; 01 &gt;&gt;&gt;</p>
        </header>

        <div className="ive-id__logo" aria-label="IVE">
          <span>i</span><span>v</span><span>e</span>
        </div>

        <figure className="ive-id__photo">
          <img src="/assets/obj/liz/liz-ive-id-photo.jpg" alt="Liz blonde portrait" />
        </figure>

        <section className="ive-id__profile">
          <div className="ive-id__watermark" aria-hidden="true"><span>IVE</span><span>The 1st</span><span>Single Album</span></div>
          <div className="ive-id__name">
            <span>NAME</span>
            <h2 id="ive-id-title">LIZ</h2>
          </div>
          <dl className="ive-id__details">
            <div><dt>DATE OF ISSUE</dt><dd>01 DEC 2021</dd></div>
            <div><dt>DATE OF BIRTH</dt><dd>21 NOV 2004</dd></div>
            <div className="ive-id__access"><dt>ACCESS CODE</dt><dd>I&apos;ve Taste</dd></div>
          </dl>
          <div className="ive-id__signature">
            <span>SIGNATURE</span>
            <strong aria-label="Liz signature">Liz ♡</strong>
          </div>
        </section>
      </article>
    </div>
  )
}
