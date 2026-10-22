// Class names for the account pages' controls (sign-in, settings, user menu), on the shadcn color
// tokens in styles.css. Replace with shadcn Button/Input once the site adds src/components/ui.
// Focus rings are a 2px outline with a 2px gap, so forced-colors mode still paints them.
const focusRing =
	"outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-foreground";

const buttonBase = `inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-sm font-medium whitespace-nowrap select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-60 ${focusRing}`;

export const primaryButton = `${buttonBase} bg-primary text-primary-foreground hover:bg-primary/85`;

export const secondaryButton = `${buttonBase} border border-border bg-background text-foreground hover:bg-accent`;

export const dangerButton = `${buttonBase} bg-destructive text-white hover:bg-destructive/85`;

// Quiet until hovered: red is saved for the button that actually destroys something.
export const quietDangerButton = `${buttonBase} h-9 px-3 text-muted-foreground hover:bg-destructive/10 hover:text-destructive`;

// 16px text so Safari on iPhone doesn't zoom into the field.
export const textInput = `h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-base text-foreground placeholder:text-muted-foreground aria-invalid:border-destructive ${focusRing} focus-visible:outline-offset-0`;

export const fieldError = "text-sm text-destructive";

export const fieldHint = "text-sm text-muted-foreground";
