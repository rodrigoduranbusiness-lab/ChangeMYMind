/**
 * Film grain is applied globally via `body::before` in `src/index.css` so it
 * covers every page without depending on React mount order. This component is
 * kept so call sites stay explicit; it renders nothing.
 */
export default function Grain() {
  return null
}
