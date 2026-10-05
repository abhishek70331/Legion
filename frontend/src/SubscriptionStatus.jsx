import { useState } from "react";
import { daysLeftText, formatDate, validUntilText } from "./subscriptionUtils.js";

// Compact "valid until" indicator for the page header (regular users only).
export function SubscriptionChip({ subscription }) {
    if (!subscription) return null;

    const { state } = subscription;
    const title =
        state === "unlimited"
            ? "Your access has no expiry date"
            : `Your subscription is valid until ${validUntilText(subscription, { weekday: true })}`;

    return (
        <span className={`sub-chip sub-chip-${state}`} title={title}>
            <span className="sub-chip-dot" aria-hidden="true" />
            <span className="sub-chip-text">
                <span className="sub-chip-label">
                    {state === "unlimited" ? "Subscription" : "Valid until"}
                </span>
                <strong>
                    {state === "unlimited" ? "No expiry" : formatDate(subscription.expires_on)}
                </strong>
            </span>
            {state !== "unlimited" && (
                <span className="sub-chip-left">{daysLeftText(subscription)}</span>
            )}
        </span>
    );
}

// Reminder shown when the subscription is close to its end date.
export function SubscriptionBanner({ subscription }) {
    const [dismissedFor, setDismissedFor] = useState(null);

    if (!subscription || subscription.state !== "expiring") return null;
    if (dismissedFor === subscription.expires_on) return null;

    const days = subscription.days_remaining;
    const when =
        days === 0
            ? "today"
            : days === 1
                ? "tomorrow"
                : `in ${days} days`;

    return (
        <div className="sub-banner content" role="status">
            <span className="sub-banner-icon" aria-hidden="true">!</span>
            <p>
                <strong>Your subscription expires {when}</strong>
                {" "}(last day of access: {formatDate(subscription.expires_on, { weekday: true })}).
                {" "}Please contact your administrator to renew and avoid interruption.
            </p>
            <button
                type="button"
                className="sub-banner-close"
                onClick={() => setDismissedFor(subscription.expires_on)}
                aria-label="Dismiss reminder"
            >
                ×
            </button>
        </div>
    );
}
