// The potli mark: a cloth bundle gathered and tied at the top, the way a tarball bundles a package.
export function PotliMark({ className }: { className?: string }) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
			className={className}
		>
			<path d="M9.2 9.2C6.1 10.6 4.4 13.2 4.6 16.1c.2 3 3.2 4.9 7.4 4.9s7.2-1.9 7.4-4.9c.2-2.9-1.5-5.5-4.6-6.9" />
			<path d="M9.4 8.9 7.6 4.6l2.6 1.1L12 3.4l1.8 2.3 2.6-1.1-1.8 4.3" />
			<path d="M8.9 9.2h6.2" strokeWidth="2.4" className="text-primary" stroke="currentColor" />
			<path d="M15.1 9.3c.9.7 1.4 1.8 1.2 3" className="text-primary" stroke="currentColor" />
		</svg>
	);
}
