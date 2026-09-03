import { dedupeImageUrls, imageUrlSignature } from "./image-signature.ts";

Deno.test("ig cdn variants collapse to one signature", () => {
  const variants = [
    "https://scontent.fgru8-1.fna.fbcdn.net/v/t51.2885-15/472745922_18039343567412860_2936229419791433728_n.jpg?_nc_cat=100&oh=aaa",
    "https://scontent.cdninstagram.com/v/t51.2885-15/472745922_18039343567412860_2936229419791433728_n.jpg?_nc_cat=104&oh=bbb",
    "https://scontent.xx.fbcdn.net/v/t51.2885-15/472745922_18039343567412860_2936229419791433728_n.jpg?stp=dst-jpg_e35",
  ];
  const signatures = new Set(variants.map((value) => imageUrlSignature(value)));
  assertEquals(signatures.size, 1);
  assertEquals(dedupeImageUrls(variants).length, 1);
});

Deno.test("weby /l/ and /o/ variants collapse, distinct dirs stay distinct", () => {
  const l = "https://ufg.br/weby/up/1/l/post_MEM_02-09_.png";
  const o = "https://ufg.br/weby/up/1/o/post_MEM_02-09_.png";
  const other = "https://ufg.br/weby/up/190/o/post_MEM_02-09_.png";
  assertEquals(imageUrlSignature(l), imageUrlSignature(o));
  assertEquals(dedupeImageUrls([l, o]).length, 1);
  assertEquals(dedupeImageUrls([o, other]).length, 2);
});

Deno.test("limit and non-http values are respected", () => {
  const values = ["", "notaurl", "https://a.test/1.jpg", "https://a.test/1.jpg?x", "https://a.test/2.jpg"];
  const deduped = dedupeImageUrls(values, 2);
  assertEquals(deduped, ["https://a.test/1.jpg", "https://a.test/2.jpg"]);
});

function assertEquals<T>(actual: T, expected: T, msg?: string): void {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);
  if (a !== b) throw new Error(msg || `assertEquals failed: ${a} !== ${b}`);
}
