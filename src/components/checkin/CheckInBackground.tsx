export function CheckInBackground() {
  return (
    <svg className="checkin-background" viewBox="0 0 1440 800" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="checkin-gold-wave" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#b88720" stopOpacity=".78" />
          <stop offset=".5" stopColor="#c49a38" stopOpacity=".45" />
          <stop offset="1" stopColor="#a97b1b" stopOpacity=".72" />
        </linearGradient>
        <linearGradient id="checkin-silk" x1="0" y1="0" x2="0" y2="1">
          <stop stopColor="#c29a3f" stopOpacity=".23" />
          <stop offset=".55" stopColor="#ebd59b" stopOpacity=".14" />
          <stop offset="1" stopColor="#a77d21" stopOpacity=".35" />
        </linearGradient>
      </defs>
      <path d="M-100 505 C155 620 170 240 490 425 C750 560 930 470 1140 236 C1270 92 1370 36 1530 0 L1530 115 C1280 85 1250 350 1050 430 C710 620 570 320 350 431 C160 530 50 584-100 505Z" fill="url(#checkin-silk)" />
      <path d="M-100 450 C170 530 245 362 405 407 C740 505 872 344 1120 278 C1290 233 1310 500 1530 562 L1530 460 C1300 402 1280 196 1105 282 C810 430 740 560 390 410 C200 330 160 550-100 450Z" fill="#c49a38" opacity=".14" />
      {Array.from({ length: 25 }, (_, index) => (
        <g key={index} fill="none" stroke="url(#checkin-gold-wave)" strokeWidth=".9">
          <path d={`M-70 ${150 + index * 7} C120 ${140 + index * 8}, 100 ${530 - index * 3}, 385 422 S1030 ${430 - index * 3}, 1165 ${230 - index * 5} S1395 ${8 + index * 4}, 1500 ${-16 + index * 5}`} />
          <path d={`M-70 ${470 + index * 9} C110 ${620 - index * 4}, 210 ${360 + index * 3}, 410 410 S985 ${422 - index * 2}, 1180 ${290 + index * 2} S1370 ${320 + index * 8}, 1500 ${400 + index * 8}`} />
        </g>
      ))}
    </svg>
  );
}
