/**
 * Icons from the design round, 24 px viewBox, stroke = currentColor.
 * Same paths as the Figma `Icon/*` components.
 */
import type { SVGProps } from "react";

type IconProps = Omit<SVGProps<SVGSVGElement>, "children"> & { size?: number; strokeWidth?: number };

function make(paths: React.ReactNode, defaultStroke = 2) {
  return function Icon({ size = 24, strokeWidth = defaultStroke, ...rest }: IconProps) {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        {...rest}
      >
        {paths}
      </svg>
    );
  };
}

export const BellIcon = make(<><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10 21a2 2 0 0 0 4 0" /></>, 1.8);
export const ChevronDownIcon = make(<path d="m6 9 6 6 6-6" />, 2.2);
export const ChevronLeftIcon = make(<path d="m15 6-6 6 6 6" />);
export const ChevronRightIcon = make(<path d="m9 6 6 6-6 6" />);
export const ClockIcon = make(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>);
export const CheckIcon = make(<path d="m5 12 5 5L20 7" />, 2.5);
export const CalendarIcon = make(<><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
export const SearchIcon = make(<><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>);
export const LockIcon = make(<><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>);
export const UserIcon = make(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>);
export const HomeIcon = make(<path d="M4 11 12 4l8 7v9H4z" />);
export const PackageIcon = make(<><path d="M4 6h16v12H4z" /><path d="M4 10h16" /></>);
export const FiltersIcon = make(<path d="M4 6h16M7 12h10M10 18h4" />);
export const ShieldIcon = make(<><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>);
export const CameraIcon = make(<><path d="M4 8a2 2 0 0 1 2-2h2l2-2h4l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><circle cx="12" cy="13" r="3.5" /></>);
export const CloseIcon = make(<path d="M6 6l12 12M18 6 6 18" />, 2.2);
