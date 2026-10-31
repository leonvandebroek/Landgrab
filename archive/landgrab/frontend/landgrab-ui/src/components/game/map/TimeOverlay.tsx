import { getTimeOverlayStyle, getTimePeriod } from '../../../utils/timeOfDay';

type TimePeriod = ReturnType<typeof getTimePeriod>;

interface TimeOverlayProps {
  timePeriod: TimePeriod;
}

export function TimeOverlay({ timePeriod }: TimeOverlayProps) {
  return <div className="time-overlay" style={getTimeOverlayStyle(timePeriod)} />;
}
