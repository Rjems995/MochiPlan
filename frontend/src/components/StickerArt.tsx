import { illustrationFor } from "../illustrations";

const ink = "#805f59",
  pink = "#efb6c9",
  cream = "#fff5df",
  green = "#a9bf91",
  lilac = "#c8b7e4",
  gold = "#f2d18e";
function Face({ x = 32, y = 35 }: { x?: number; y?: number }) {
  return (
    <g stroke={ink} strokeWidth="1.5" fill="none">
      <circle cx={x - 6} cy={y} r="1.3" fill={ink} stroke="none" />
      <circle cx={x + 6} cy={y} r="1.3" fill={ink} stroke="none" />
      <path d={`M${x - 3} ${y + 4}q3 3 6 0`} />
      <ellipse
        cx={x - 10}
        cy={y + 3}
        rx="3"
        ry="1.7"
        fill={pink}
        stroke="none"
      />
      <ellipse
        cx={x + 10}
        cy={y + 3}
        rx="3"
        ry="1.7"
        fill={pink}
        stroke="none"
      />
    </g>
  );
}
function Petals({
  color = pink,
  count = 6,
}: {
  color?: string;
  count?: number;
}) {
  return (
    <>
      {Array.from({ length: count }, (_, i) => (
        <ellipse
          key={i}
          cx="32"
          cy="17"
          rx="7"
          ry="12"
          fill={color}
          transform={`rotate(${(i * 360) / count} 32 30)`}
        />
      ))}
    </>
  );
}
function Drawing({ kind }: { kind: string }) {
  switch (kind) {
    case "strawberry":
      return (
        <>
          <path
            d="M13 24q19-12 38 0c1 16-12 31-19 33C25 54 12 40 13 24Z"
            fill={pink}
          />
          <path d="m32 12-9 9-10-2 9 10 10-6 10 6 9-10-10 2Z" fill={green} />
          <path
            d="m23 32-1 2m20-2 1 2m-24 7 2 1m22-1-2 1m-13 6 1 2m8-2-1 2"
            stroke={cream}
            strokeWidth="2.5"
          />
          <Face y={36} />
        </>
      );
    case "matcha":
    case "coffee":
      return (
        <>
          <path d="M45 29h6c11 0 11 16-5 17" fill={cream} />
          <path d="M12 26h34v16c0 9-7 13-17 13S12 51 12 42Z" fill={cream} />
          <ellipse
            cx="29"
            cy="26"
            rx="17"
            ry="5"
            fill={kind === "matcha" ? green : "#bc9178"}
          />
          <path d="M17 58h30M24 16q-5-5 0-10m12 10q-5-5 0-10" fill="none" />
          <Face x={29} y={39} />
        </>
      );
    case "tulip":
      return (
        <>
          <path
            d="M32 54V29m0 22C16 51 12 43 12 38c11 0 19 6 20 13m0-5c14 1 19-8 19-13-10 1-17 5-19 13"
            fill={green}
          />
          <path
            d="M16 11q8 0 16 10 8-10 16-10v15c0 12-10 15-16 15s-16-3-16-15Z"
            fill={pink}
          />
          <path d="M23 13q4 13 9 15 5-2 9-15" fill="none" />
          <Face y={29} />
        </>
      );
    case "daisy":
    case "blossom":
    case "sunflower":
      return (
        <>
          <path
            d="M32 42v18m0-7q-15 0-17-10 13-1 17 10m0 2q15 0 17-10-13-1-17 10"
            fill={green}
          />
          <Petals
            color={
              kind === "daisy" ? cream : kind === "sunflower" ? gold : pink
            }
            count={kind === "blossom" ? 5 : 8}
          />
          <circle
            cx="32"
            cy="30"
            r="11"
            fill={kind === "sunflower" ? "#d6aa83" : gold}
          />
          <Face y={29} />
        </>
      );
    case "cherries":
      return (
        <>
          <path d="M20 38q13-15 15-31 7 13 10 31" fill="none" />
          <path d="M34 10q-15-9-20 1 10 5 20-1Z" fill={green} />
          <circle cx="19" cy="44" r="12" fill={pink} />
          <circle cx="46" cy="44" r="12" fill="#e6a3b6" />
          <path
            d="M13 41q1-3 4-3m23 3q1-3 4-3"
            stroke={cream}
            strokeWidth="3"
          />
        </>
      );
    case "cat":
    case "bear":
    case "bunny":
    case "teddy":
      return (
        <>
          {kind === "cat" ? (
            <path d="m12 29 1-20 15 12m8 0L51 9l1 20" fill={gold} />
          ) : kind === "bunny" ? (
            <>
              <ellipse cx="22" cy="18" rx="7" ry="15" fill={cream} />
              <ellipse cx="42" cy="18" rx="7" ry="15" fill={cream} />
              <path d="M22 9v15m20-15v15" stroke={pink} strokeWidth="4" />
            </>
          ) : (
            <>
              <circle cx="16" cy="22" r="10" fill="#d9b69b" />
              <circle cx="48" cy="22" r="10" fill="#d9b69b" />
              <circle cx="16" cy="22" r="5" fill={pink} stroke="none" />
              <circle cx="48" cy="22" r="5" fill={pink} stroke="none" />
            </>
          )}
          {kind === "teddy" && (
            <>
              <ellipse cx="32" cy="46" rx="15" ry="14" fill="#d9b69b" />
              <ellipse cx="32" cy="47" rx="8" ry="9" fill={cream} />
              <circle cx="14" cy="43" r="7" fill="#d9b69b" />
              <circle cx="50" cy="43" r="7" fill="#d9b69b" />
              <circle cx="20" cy="56" r="7" fill="#d9b69b" />
              <circle cx="44" cy="56" r="7" fill="#d9b69b" />
            </>
          )}
          <ellipse
            cx="32"
            cy={kind === "teddy" ? 27 : 37}
            rx={kind === "teddy" ? 19 : 24}
            ry={kind === "teddy" ? 17 : 20}
            fill={kind === "cat" ? gold : kind === "bunny" ? cream : "#d9b69b"}
          />
          <Face y={kind === "teddy" ? 25 : 35} />
          {kind === "cat" && (
            <path
              d="m9 37 8 2m-7 5 7-1m38-6-8 2m7 5-7-1M27 21l5 6 5-6"
              fill="none"
            />
          )}
          {kind === "teddy" && (
            <path d="m32 43-8-5v10l8-5 8-5v10Z" fill={pink} />
          )}
        </>
      );
    case "star":
    case "keepsake":
      return (
        <>
          <path
            d="m32 6 8 16 18 3-13 13 3 18-16-9-16 9 3-18L6 25l18-3Z"
            fill={gold}
          />
          <Face y={31} />
        </>
      );
    case "sparkles":
      return (
        <>
          <path d="m28 8 5 17 16 6-16 6-5 18-6-18-16-6 16-6Z" fill={gold} />
          <path
            d="m50 4 2 7 7 3-7 2-2 8-3-8-7-2 7-3Zm0 37 2 6 6 2-6 2-2 7-2-7-6-2 6-2Z"
            fill={pink}
          />
        </>
      );
    case "white-heart":
    case "pink-heart":
      return (
        <>
          <path
            d="M32 54S7 40 7 23C7 7 26 5 32 19 38 5 57 7 57 23c0 17-25 31-25 31Z"
            fill={kind === "white-heart" ? cream : pink}
          />
          <Face y={30} />
          <path d="M16 21q1-6 7-6" stroke="#fffaf5" strokeWidth="3" />
        </>
      );
    case "cloud":
      return (
        <>
          <path
            d="M17 49C1 49 2 29 16 28c-2-19 27-24 33-5 18 0 20 26 2 26Z"
            fill="#eeebf8"
          />
          <Face y={35} />
        </>
      );
    case "rainbow":
      return (
        <>
          <path
            d="M9 45v-7a23 23 0 0 1 46 0v7"
            stroke={pink}
            strokeWidth="9"
            fill="none"
          />
          <path
            d="M17 45v-7a15 15 0 0 1 30 0v7"
            stroke={gold}
            strokeWidth="7"
            fill="none"
          />
          <path
            d="M24 45v-7a8 8 0 0 1 16 0v7"
            stroke={green}
            strokeWidth="7"
            fill="none"
          />
          <path
            d="M5 52c-5-10 5-17 11-9 7-4 13 7 4 10Zm39 0c-7-7 3-15 8-10 7-4 14 8 5 11Z"
            fill={cream}
          />
        </>
      );
    case "books":
      return (
        <>
          <rect x="9" y="41" width="46" height="13" rx="3" fill={green} />
          <rect x="14" y="28" width="41" height="13" rx="3" fill={pink} />
          <rect x="9" y="14" width="44" height="14" rx="3" fill={lilac} />
          <path d="M18 19h31m-28 14h30m-34 13h33" stroke={cream} />
          <path d="M38 14v11l4-3 4 3V14" fill={gold} />
        </>
      );
    case "pencil":
      return (
        <>
          <g transform="rotate(35 32 32)">
            <path d="M24 14h16v34l-8 12-8-12Z" fill={gold} />
            <path d="m24 48 8 12 8-12" fill={cream} />
            <path d="m29 56 3 4 3-4Z" fill={ink} />
            <path d="M24 14V9q8-8 16 0v5Z" fill={pink} />
            <path d="M24 16h16m-8 7v20" fill="none" />
          </g>
        </>
      );
    case "croissant":
      return (
        <>
          <path
            d="M12 49C-1 40 6 24 18 20c7-14 25-14 32 0 13 4 18 20 5 29l-8-9H19Z"
            fill={gold}
          />
          <path
            d="m18 20 5 26m27-26-9 26M25 11l4 27m10-28-4 28M11 26l8 14m34-14-6 14"
            fill="none"
          />
          <path d="M10 48q9 6 13-2m21 0q3 8 11 3" fill="none" />
        </>
      );
    case "cake":
      return (
        <>
          <path d="m10 26 29-14 16 14v27H10Z" fill={cream} />
          <path d="m10 26 29-14 16 14-29 12Z" fill={pink} />
          <path d="M10 39h45v8H10Z" fill={pink} />
          <path
            d="M10 26v7q4 8 8 0 5 8 9 0 5 8 9 0 5 7 9-1l10-6"
            fill="#fffaf3"
          />
          <circle cx="35" cy="17" r="6" fill="#e6a3b6" />
          <path d="M35 11q0-6 6-6" fill="none" />
        </>
      );
    case "bow":
      return (
        <>
          <path d="m28 34-8 23-8-8 8-20m16 5 8 23 8-8-8-20" fill={pink} />
          <path d="M30 23C1-2 4 48 28 35m6-12c29-25 26 25 2 12" fill={pink} />
          <path d="m13 20 13 9m25-9-13 9" fill="none" />
          <rect x="25" y="22" width="14" height="15" rx="5" fill="#e7a0b8" />
        </>
      );
    case "butterfly":
      return (
        <>
          <path
            d="M30 33C8-5-7 28 21 37-2 46 18 66 31 43m3-10C56-5 71 28 43 37c23 9 3 29-10 6"
            fill={lilac}
          />
          <path d="M29 23q-10-13-12-6m18 6q10-13 12-6" fill="none" />
          <ellipse cx="32" cy="36" rx="4" ry="17" fill={gold} />
          <circle cx="14" cy="26" r="4" fill={pink} stroke="none" />
          <circle cx="50" cy="26" r="4" fill={pink} stroke="none" />
        </>
      );
    case "leaves":
      return (
        <>
          <path d="M20 59 42 9" fill="none" />
          <path
            d="M27 42C6 44 5 30 9 24c13 0 19 7 18 18m5-10C17 28 18 15 24 12c10 5 12 13 8 20m3 0c0-19 16-22 22-16-2 13-10 18-22 16m-8 12c7-17 22-17 27-9-6 11-16 14-27 9"
            fill={green}
          />
        </>
      );
    case "moon":
      return (
        <>
          <path
            d="M41 6C7 0-5 47 26 57c17 6 30-7 31-20-22 12-39-8-16-31Z"
            fill={gold}
          />
          <path d="m47 9 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill={lilac} />
          <Face x={23} y={35} />
        </>
      );
    case "boba":
      return (
        <>
          <path d="m17 21 4 37h24l4-37" fill="#ead0ae" />
          <path d="m34 22 8-17h6l-8 17" fill={pink} />
          <rect x="14" y="18" width="38" height="7" rx="3" fill={cream} />
          <Face y={36} />
          <g fill={ink} stroke="none">
            <circle cx="27" cy="51" r="2.5" />
            <circle cx="38" cy="53" r="2.5" />
            <circle cx="34" cy="46" r="2.5" />
            <circle cx="42" cy="48" r="2.5" />
            <circle cx="24" cy="44" r="2" />
          </g>
        </>
      );
    case "mushroom":
      return (
        <>
          <path d="m25 29-6 25c0 9 26 9 26 0l-6-25" fill={cream} />
          <path d="M7 30c3-34 47-34 50 0q-25 10-50 0Z" fill={pink} />
          <circle cx="23" cy="17" r="5" fill={cream} stroke="none" />
          <circle cx="42" cy="23" r="6" fill={cream} stroke="none" />
          <Face y={46} />
        </>
      );
    case "paw":
      return (
        <>
          <path
            d="M17 49c1-9 10-21 15-21s14 12 15 21c1 12-12 5-15 5s-16 7-15-5Z"
            fill={pink}
          />
          <ellipse
            cx="12"
            cy="28"
            rx="6"
            ry="8"
            fill={pink}
            transform="rotate(-30 12 28)"
          />
          <ellipse cx="25" cy="17" rx="6" ry="8" fill={pink} />
          <ellipse cx="40" cy="17" rx="6" ry="8" fill={pink} />
          <ellipse
            cx="53"
            cy="28"
            rx="6"
            ry="8"
            fill={pink}
            transform="rotate(30 53 28)"
          />
        </>
      );
    case "candle":
      return (
        <>
          <path d="M19 27h26v29H19Z" fill={cream} />
          <path d="M19 27q5 8 8 0 5 12 9 0 4 7 9 0" fill={pink} />
          <path d="M32 25v-6m-17 39h34" fill="none" />
          <path d="M32 4q-18 17 0 17 14-2 0-17Z" fill={gold} />
          <Face y={42} />
        </>
      );
    case "blueberries":
      return (
        <>
          <circle cx="22" cy="40" r="14" fill={lilac} />
          <circle cx="45" cy="39" r="14" fill="#a6b7dc" />
          <circle cx="32" cy="22" r="14" fill="#b7acd9" />
          <path
            d="m32 14 2 5 5-1-4 4 2 4-5-2-5 2 2-4-4-4 5 1Z"
            fill="#8d82b4"
          />
          <path d="m16 32 3 3m27-4 3 3" stroke={cream} strokeWidth="3" />
        </>
      );
    case "peach":
      return (
        <>
          <path
            d="M32 17C7 4 1 36 18 51q14 11 28 0C63 36 57 4 32 17Z"
            fill="#f0bea7"
          />
          <path d="M32 17q-7 14-1 32" fill="none" />
          <path d="M32 17C30 2 48 3 52 7q-7 13-20 10Z" fill={green} />
          <path d="M16 24q-4 7-1 12" stroke={cream} strokeWidth="3" />
        </>
      );
    case "scroll":
      return (
        <>
          <path
            d="M14 9h36q-8 0-8 10v27c0 12-24 13-24 1V19c0-10-4-10-4-10Z"
            fill={cream}
          />
          <path
            d="M14 9q-10 1-7 11h14m-3 26h34q6 10-8 11H27M25 24h10m-10 8h10m-10 8h10"
            fill="none"
          />
        </>
      );
    case "lavender":
      return (
        <>
          <path
            d="M28 59 39 12m-8 32q-15 4-16-7 12-2 16 7m2-8q16 1 17-10-12 0-17 10"
            fill={green}
          />
          {[0, 1, 2, 3].map((n) => (
            <g key={n} transform={`translate(${n * 2} ${-n * 8})`}>
              <ellipse
                cx="30"
                cy="32"
                rx="6"
                ry="4"
                fill={lilac}
                transform="rotate(30 30 32)"
              />
              <ellipse
                cx="39"
                cy="30"
                rx="6"
                ry="4"
                fill={lilac}
                transform="rotate(-30 39 30)"
              />
            </g>
          ))}
        </>
      );
    case "palette":
      return (
        <>
          <path
            d="M53 39c-10-7-8 3-14 8-17 18-40-1-32-23C14 4 43 3 55 19c7 9 3 24-2 20Z"
            fill={cream}
          />
          <circle cx="19" cy="25" r="5" fill={pink} />
          <circle cx="31" cy="17" r="5" fill={gold} />
          <circle cx="45" cy="23" r="5" fill={lilac} />
          <circle cx="16" cy="39" r="5" fill={green} />
          <ellipse cx="42" cy="39" rx="4" ry="6" fill="#fffdfa" />
        </>
      );
    default:
      return null;
  }
}

export function StickerArt({
  token,
  className = "",
}: {
  token: string;
  className?: string;
}) {
  const art = illustrationFor(token);
  return (
    <svg
      className={`sticker-art ${className}`}
      viewBox="0 0 64 64"
      width="1em"
      height="1em"
      fill="none"
      stroke={ink}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      data-illustration={art.key}
    >
      <Drawing kind={art.key} />
    </svg>
  );
}
