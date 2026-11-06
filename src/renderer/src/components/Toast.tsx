export function Toast({ text }: { text: string }) {
  return <div className="toast" role="status">{text}</div>
}
