import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronRight, Calendar, Clock, MapPin, ExternalLink } from "lucide-react";
import { getEventDetails } from "@/lib/api-client";
import { EventForm } from "./EventForm";
import { FormattedText } from "@/components/common/FormattedText";

interface Props {
    params: Promise<{ spaceId: string; eventId: string }>;
}

export default async function EventPage({ params }: Props) {
    const { spaceId, eventId } = await params;
    const headerStore = await headers();
    const cookie = headerStore.get("cookie") ?? "";

    let data;
    try {
        data = await getEventDetails(spaceId, eventId, cookie);
    } catch (err) {
        console.error(`[event-page] Failed to fetch event ${eventId}:`, err);
        return notFound();
    }

    const { event, metadata } = data;

    const startDate = new Date(event.start);
    const endDate = new Date(event.end);
    const dateLabel = startDate.toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    });
    const startTime = startDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: false,
    });
    const endTime = endDate.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
        hour12: false,
    });

    return (
        <div className="p-6 lg:p-8 max-w-5xl mx-auto">
            {/* Breadcrumb */}
            <nav className="mb-6 flex items-center gap-1.5 text-xs text-snomed-grey/50">
                <Link href="/spaces" className="hover:text-snomed-blue transition-colors">
                    Spaces
                </Link>
                <ChevronRight size={12} aria-hidden="true" />
                <Link
                    href={`/spaces/${spaceId}`}
                    className="hover:text-snomed-blue transition-colors"
                >
                    {event.spaceName}
                </Link>
                <ChevronRight size={12} aria-hidden="true" />
                <Link
                    href={`/spaces/${spaceId}/calendar`}
                    className="hover:text-snomed-blue transition-colors"
                >
                    Calendar
                </Link>
                <ChevronRight size={12} aria-hidden="true" />
                <span className="text-snomed-grey font-medium truncate max-w-[200px]">
                    {event.summary}
                </span>
            </nav>

            {/* Event Header */}
            <div className="mb-8 p-6 rounded-2xl border border-snomed-border bg-white shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-snomed-blue-light flex items-center justify-center">
                        <Calendar size={24} className="text-snomed-blue" aria-hidden="true" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-bold text-snomed-grey">{event.summary}</h1>
                        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-snomed-grey/60">
                            <span className="flex items-center gap-1.5">
                                <Clock size={14} aria-hidden="true" />
                                {dateLabel} · {startTime} – {endTime} UTC
                            </span>
                            {event.location && (
                                <span className="flex items-center gap-1.5">
                                    <MapPin size={14} aria-hidden="true" />
                                    {event.location}
                                </span>
                            )}
                        </div>
                    </div>
                </div>

                {event.htmlLink && (
                    <a
                        href={event.htmlLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-snomed-blue bg-snomed-blue-light rounded-lg hover:bg-snomed-blue/10 transition-colors"
                    >
                        <ExternalLink size={16} />
                        Google Calendar
                    </a>
                )}
            </div>

            {event.description && (
                <div className="mb-8 p-6 rounded-2xl border border-snomed-border bg-white shadow-sm">
                    <h2 className="text-sm font-semibold text-snomed-grey uppercase tracking-wider mb-3">Description</h2>
                    <FormattedText text={event.description} />
                </div>
            )}

            {/* Interactive Part */}
            <EventForm spaceId={spaceId} eventId={eventId} initialMetadata={metadata} />
        </div>
    );
}
