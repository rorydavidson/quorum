'use client';

import DOMPurify from 'isomorphic-dompurify';

/**
 * Renders text that may contain HTML (e.g. Google Calendar descriptions) or
 * simple Markdown-style formatting.
 *
 * All HTML is sanitised with DOMPurify before being injected, so untrusted
 * sources (calendar events, iCal feeds) cannot introduce script execution,
 * event-handler attributes, or `javascript:` URLs.
 */

// Allow only inline/formatting/list markup — never scripts, styles, images,
// iframes, form controls, or event-handler attributes.
const SANITIZE_CONFIG = {
    ALLOWED_TAGS: [
        'a', 'b', 'strong', 'i', 'em', 'u', 's', 'br', 'p', 'span', 'div',
        'ul', 'ol', 'li', 'blockquote', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    ],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
    // Restrict URL schemes so href="javascript:..." / "data:..." are stripped.
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
};

function sanitize(html: string): string {
    const clean = DOMPurify.sanitize(html, SANITIZE_CONFIG);
    // Force external links to open safely (no reverse-tabnabbing).
    return clean.replace(
        /<a\s/gi,
        '<a target="_blank" rel="noopener noreferrer" ',
    );
}

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function FormattedText({ text, className = '' }: { text?: string; className?: string }) {
    if (!text) return null;

    // Detect if it likely contains HTML
    const hasHtml = /<[a-z][\s\S]*>/i.test(text);

    if (hasHtml) {
        return (
            <div
                className={`prose prose-sm max-w-none text-snomed-grey/70 ${className}`}
                dangerouslySetInnerHTML={{ __html: sanitize(text) }}
            />
        );
    }

    // Handle basic Markdown-like formatting if no HTML is present.
    // Escape first so any stray markup in the source is inert, then re-introduce
    // only the safe subset of tags we generate ourselves.
    // 1. Links: [label](url) -> <a href="url">label</a> (http/https/mailto only)
    // 2. Bold: **text** -> <strong>text</strong>
    // 3. Newlines: \n -> <br />
    const formatted = escapeHtml(text)
        .replace(
            /\[([^\]]+)\]\(([^)]+)\)/g,
            (match, label: string, url: string) => {
                // url is already HTML-escaped; decode the entity form of & for scheme check
                const scheme = url.trim().toLowerCase();
                if (!/^(https?:|mailto:)/.test(scheme)) {
                    // Unsafe or relative scheme — render the label as plain text
                    return label;
                }
                return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-snomed-blue hover:underline">${label}</a>`;
            },
        )
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br />');

    return (
        <div
            className={`text-snomed-grey/70 leading-relaxed ${className}`}
            dangerouslySetInnerHTML={{ __html: sanitize(formatted) }}
        />
    );
}
