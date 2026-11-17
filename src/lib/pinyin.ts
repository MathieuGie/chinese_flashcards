import { customPinyin, pinyin as toPinyin } from "pinyin-pro";

// pinyin-pro is very good, but structural particles (得/地 → de) and a few
// neutral tones trip it up. These overrides fix the common cases.
customPinyin({
  勺子: "sháo zi",
  饺子: "jiǎo zi",
  告诉: "gào su",
  东西: "dōng xi",
  凑合: "còu he",
  面糊: "miàn hú",
  卷成: "juǎn chéng",
  只差: "zhǐ chà",
  只有: "zhǐ yǒu",
  得很: "de hěn",
  得非常: "de fēi cháng",
  得太: "de tài",
  得真: "de zhēn",
  得特别: "de tè bié",
  得出奇: "de chū qí",
  得好: "de hǎo",
  得快: "de kuài",
  得慢: "de màn",
  得动: "de dòng",
  得雍: "de yōng",
  地安静: "de ān jìng",
  地冷: "de lěng",
  地宣誓: "de xuān shì",
  地清理: "de qīng lǐ",
  地说: "de shuō",
  地看着: "de kàn zhe",
  地笑: "de xiào",
  地走: "de zǒu",
  地回答: "de huí dá",
  地点头: "de diǎn tóu",
});

export function sentencePinyin(text: string) {
  return toPinyin(text)
    .replace(/\s+([，。！？、；：”’）》,.!?;:)])/g, "$1")
    .replace(/([“‘（《(])\s+/g, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function wordPinyin(text: string) {
  return toPinyin(text);
}
