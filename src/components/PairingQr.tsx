import { pairingQrMatrix } from '../lib/pairingQr'

export function PairingQr({ code, size = 220 }: { code: string; size?: number }) {
  const matrix = pairingQrMatrix(code)
  const quietZone = 4
  const dimension = matrix.length + quietZone * 2

  return (
    <svg
      className="pairing-qr"
      width={size}
      height={size}
      viewBox={`0 0 ${dimension} ${dimension}`}
      role="img"
      aria-label="BulkText gateway pairing QR code"
      shapeRendering="crispEdges"
    >
      <rect width={dimension} height={dimension} fill="white" />
      {matrix.flatMap((row, y) => row.map((dark, x) => dark ? (
        <rect key={`${x}-${y}`} x={x + quietZone} y={y + quietZone} width="1" height="1" fill="black" />
      ) : null))}
    </svg>
  )
}
