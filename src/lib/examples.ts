import type { AspectId, StyleId } from "./models";

export type Example = {
  id: string;
  indexLabel: string;
  title: string;
  cardTitle: string;
  image: string;
  alt: string;
  styleId: StyleId;
  styleLabel: string;
  aspect: AspectId;
  prompt: string;
  meta: string;
};

export const EXAMPLES: Example[] = [
  {
    id: "art-0",
    indexLabel: "01",
    title: "开往夏天的列车",
    cardTitle: "落日慢车",
    image: "/examples/art-0.jpg",
    alt: "示例插画：海边石拱桥上的绿色列车，橘猫坐在野花间看海",
    styleId: "pixel",
    styleLabel: "像素插画",
    aspect: "4:3",
    prompt: "海边的旧铁路，开往夏天的列车。\n落日把云染成杏色，野花随风摇动，\n一只小猫坐在石墙上看海。",
    meta: "像素插画 / 4:3 / 示例参数",
  },
  {
    id: "art-1",
    indexLabel: "02",
    title: "午后，一枝高尾",
    cardTitle: "午后，一枝高尾",
    image: "/examples/art-1.jpg",
    alt: "示例摄影：白瓷瓶里的紫色鸢尾，旁边一只梨和浅色布",
    styleId: "still",
    styleLabel: "静物摄影",
    aspect: "4:3",
    prompt: "午后的窗边，白瓷瓶里插着鸢尾。\n一只梨靠在浅色布褶上，光慢慢移过去。",
    meta: "静物摄影 / 4:3 / 示例参数",
  },
  {
    id: "art-2",
    indexLabel: "03",
    title: "穿过梦的形状",
    cardTitle: "穿过梦的形状",
    image: "/examples/art-2.jpg",
    alt: "示例三维画面：沙漠里的淡紫色拱门，浅水倒映落日",
    styleId: "surreal",
    styleLabel: "超现实 3D",
    aspect: "4:3",
    prompt: "沙漠里立着淡紫色的拱门。\n浅水倒映低垂的太阳，形状像一场还没醒来的梦。",
    meta: "超现实 3D / 4:3 / 示例参数",
  },
];

export function exampleById(id: string): Example | undefined {
  return EXAMPLES.find((item) => item.id === id);
}
