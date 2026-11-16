export function Mochi({
  className = "",
  flower = false,
}: {
  className?: string;
  flower?: boolean;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 180 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M36 92C36 54 58 30 90 30s55 24 55 62c0 20-23 26-55 26s-54-6-54-26Z"
        fill="#fff9f0"
        stroke="#a17f74"
        strokeWidth="1.8"
      />
      <path
        d="M52 43c-9-21-9-37 0-37 9 0 18 13 22 27M103 31c4-22 13-32 21-27 9 6 4 24-6 36"
        fill="#fff9f0"
        stroke="#a17f74"
        strokeWidth="1.8"
      />
      <path
        d="M54 17c-2 5 1 14 7 20M119 15c1 4-3 13-7 18"
        stroke="#f1b8c5"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx="71" cy="73" rx="2.5" ry="3.5" fill="#806457" />
      <ellipse cx="108" cy="73" rx="2.5" ry="3.5" fill="#806457" />
      <path
        d="m85 82 4 3 4-3m-4 3v3m0 0c-3 3-5 2-7 0m7 0c3 3 5 2 7 0"
        stroke="#806457"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <ellipse cx="60" cy="84" rx="8" ry="4" fill="#f4c0cc" />
      <ellipse cx="119" cy="84" rx="8" ry="4" fill="#f4c0cc" />
      <path
        d="M131 65c13-18 25-9 16 2-8 9-16 15-16 15s-12-13-13-20c-1-10 10-12 13 3Z"
        fill="#e9a4b8"
      />
      {flower && (
        <>
          <path
            d="M25 112 16 84m1 14L7 93m13 10 8-11"
            stroke="#8d9d76"
            strokeWidth="2"
          />
          <path
            d="M17 84c-15 2-16-9-6-11-6-11 5-16 10-7 9-6 15 5 6 10 6 10-5 14-10 8"
            fill="#edb8c5"
          />
          <circle cx="19" cy="77" r="4" fill="#f7df9b" />
        </>
      )}
    </svg>
  );
}
export function Flower({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 120 130"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M61 119c5-29-4-36-4-58m4 44c-15-3-25-12-24-20 13 1 24 8 24 20m-1-12c12-2 22-10 21-17-11 2-21 8-21 17"
        stroke="#8d9d76"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M54 50C21 64 14 35 38 32 20 13 43-1 55 20 63-7 88 6 73 27c30-5 33 23 8 25 18 21-7 36-18 12-13 27-36 7-9-14Z"
        fill="#edbdcd"
      />
      <circle cx="60" cy="40" r="13" fill="#f8dfa1" />
      <circle cx="56" cy="38" r="1.5" fill="#90715f" />
      <circle cx="64" cy="38" r="1.5" fill="#90715f" />
      <path
        d="M57 44q3 3 6 0"
        stroke="#90715f"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Logo() {
  return (
    <span className="brand">
      <span className="brand-icon">
        <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
          <path
            d="M6 25C6 14 12 8 20 8s14 6 14 17c0 5-6 8-14 8S6 30 6 25Z"
            fill="#fff9f4"
            stroke="#aa6f84"
            strokeWidth="1.5"
          />
          <circle cx="15" cy="22" r="1.2" fill="#8e5c70" />
          <circle cx="25" cy="22" r="1.2" fill="#8e5c70" />
          <path
            d="M18 26q2 2 4 0"
            stroke="#8e5c70"
            strokeWidth="1.2"
            strokeLinecap="round"
          />
          <ellipse cx="11" cy="25" rx="2.5" ry="1.5" fill="#edb7c7" />
          <ellipse cx="29" cy="25" rx="2.5" ry="1.5" fill="#edb7c7" />
        </svg>
      </span>
      <span>
        Mochi<span className="brand-pink">Plan</span>
        <small>a little plan, a lovely day.</small>
      </span>
    </span>
  );
}
