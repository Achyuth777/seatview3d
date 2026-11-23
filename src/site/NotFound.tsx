import { ChartSheet } from './chart';
import { Link } from './router';

export function NotFound() {
  return (
    <div className="page">
      <ChartSheet>
        <h1 className="sheet__title">This page isn’t on the chart.</h1>
        <p className="sheet__text">
          The link may be old or mistyped. <Link to="/">Go to tonight’s chart</Link>.
        </p>
      </ChartSheet>
    </div>
  );
}
