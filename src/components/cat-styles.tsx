import type { ReactNode } from "react";

export type CatStyle = {
  id: string;
  name: string;
  note: string;
  Mark: (props: { className?: string }) => ReactNode;
};

const ink = "#1c1915";
const paper = "#fffdf8";
const sticky = "#f4e6a4";
const purple = "#7b2ff7";
const blush = "#e7b4b0";

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg className={className} viewBox="0 0 48 42" aria-hidden="true">
      {children}
    </svg>
  );
}

export function FoldCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 20 L8 8 L18 18" fill={paper} stroke={ink} strokeWidth="2.4" strokeLinejoin="miter" />
      <path d="M40 20 L40 8 L30 18" fill={paper} stroke={ink} strokeWidth="2.4" strokeLinejoin="miter" />
      <ellipse cx="24" cy="24" rx="15" ry="13" fill={paper} stroke={ink} strokeWidth="2.4" />
      <circle cx="18.5" cy="23" r="1.5" fill={ink} />
      <circle cx="29.5" cy="23" r="1.5" fill={ink} />
      <path d="M22.2 28.2 h3.6 l-1.8 2.2 z" fill={ink} />
      <path d="M6 25 H12 M36 25 H42" stroke={ink} strokeWidth="2" strokeLinecap="square" />
    </Svg>
  );
}

export function RoundCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M12 18 L14 7 L22 16 Z" fill={sticky} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M36 18 L34 7 L26 16 Z" fill={sticky} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
      <circle cx="24" cy="24" r="13" fill={paper} stroke={ink} strokeWidth="2.2" />
      <circle cx="19" cy="23" r="1.6" fill={ink} />
      <circle cx="29" cy="23" r="1.6" fill={ink} />
      <path d="M22 27.5 Q24 30 26 27.5" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="14.5" cy="27" r="1.5" fill={blush} />
      <circle cx="33.5" cy="27" r="1.5" fill={blush} />
    </Svg>
  );
}

export function SleepyCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M10 19 L13 8 L21 17 Z" fill={paper} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M38 19 L35 8 L27 17 Z" fill={paper} stroke={ink} strokeWidth="2.2" strokeLinejoin="round" />
      <ellipse cx="24" cy="25" rx="14" ry="12" fill={paper} stroke={ink} strokeWidth="2.2" />
      <path d="M16 23 Q18.5 21.2 21 23" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M27 23 Q29.5 21.2 32 23" fill="none" stroke={ink} strokeWidth="1.7" strokeLinecap="round" />
      <path d="M21.5 28.2 Q24 30.4 26.5 28.2" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M31 11 l2.2-3.2 M33.6 12.2 l2.4-2.2" stroke={purple} strokeWidth="1.5" strokeLinecap="round" />
    </Svg>
  );
}

export function SealCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <circle cx="24" cy="22" r="15" fill="none" stroke={ink} strokeWidth="1.4" />
      <circle cx="24" cy="22" r="12.5" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M16 16 L17.2 10 L21.5 15.2 Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M32 16 L30.8 10 L26.5 15.2 Z" fill={paper} stroke={ink} strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="20" cy="22" r="1.3" fill={ink} />
      <circle cx="28" cy="22" r="1.3" fill={ink} />
      <path d="M23 25.2 h2 l-1 1.6 z" fill={purple} />
    </Svg>
  );
}

export function PeekCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M8 28 h32 v8 h-32 z" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M14 28 V16 L22 24" fill={paper} stroke={ink} strokeWidth="2.2" strokeLinejoin="miter" />
      <path d="M34 28 V16 L26 24" fill={paper} stroke={ink} strokeWidth="2.2" strokeLinejoin="miter" />
      <path d="M12 28 Q24 14 36 28" fill={paper} stroke={ink} strokeWidth="2.2" />
      <circle cx="20" cy="24" r="1.4" fill={ink} />
      <circle cx="28" cy="24" r="1.4" fill={ink} />
      <path d="M23 27 h2" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <path d="M18 31 h4 M26 33 h6" stroke={purple} strokeWidth="1.4" strokeLinecap="round" />
    </Svg>
  );
}

export function InkCat({ className }: { className?: string }) {
  return (
    <Svg className={className}>
      <path d="M14 18 L16 8 L23 16 Z" fill={ink} />
      <path d="M34 18 L32 8 L25 16 Z" fill={ink} />
      <circle cx="24" cy="24" r="12" fill={ink} />
      <circle cx="19.5" cy="23" r="1.7" fill={paper} />
      <circle cx="28.5" cy="23" r="1.7" fill={paper} />
      <path d="M22.4 27.4 h3.2 l-1.6 2 z" fill={sticky} />
      <path d="M7 24 H13 M35 24 H41" stroke={ink} strokeWidth="2" strokeLinecap="square" />
    </Svg>
  );
}

export const CAT_STYLES: CatStyle[] = [
  { id: "fold", name: "折线猫", note: "现在顶栏上的这只。耳朵像折过的纸，胡须是两道短线。", Mark: FoldCat },
  { id: "round", name: "团子猫", note: "耳朵里填便签黄，脸上有两团腮红，嘴是一小段弧线。", Mark: RoundCat },
  { id: "sleepy", name: "眯眼猫", note: "眼睛弯成两条线，头顶留一点紫笔画的小火花。", Mark: SleepyCat },
  { id: "seal", name: "印章猫", note: "收进双圈里，像盖在纸上的一枚圆章，鼻子用紫色。", Mark: SealCat },
  { id: "peek", name: "探头猫", note: "从一张拍立得上沿探出来，相片里有两道紫笔痕迹。", Mark: PeekCat },
  { id: "ink", name: "墨团猫", note: "整张脸填成墨色，只留纸色的眼睛和一块黄鼻子。", Mark: InkCat },
];
