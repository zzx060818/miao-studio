import { CAT_STYLES } from "@/components/cat-styles";

export default function MarksPage() {
  return (
    <main id="content" className="mark-page">
      <div className="section-head">
        <h1>小猫图标</h1>
      </div>
      <p className="mark-lead">六种都按顶栏的尺寸画的。左边是放大，右边是放进标志时的大小。选定一种再说，我再换上顶栏和浏览器图标。</p>
      <div className="mark-sheet">
        {CAT_STYLES.map(({ id, name, note, Mark }) => (
          <article key={id} className="mark-card">
            <div className="mark-stage">
              <Mark className="mark-lg" />
              <Mark className="mark-sm" />
            </div>
            <h2>{name}</h2>
            <p>{note}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
