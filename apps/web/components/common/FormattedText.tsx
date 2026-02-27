'use client';

/**
 * A simple component to render text that might contain HTML or basic Markdown.
 * Since we are constrained on third-party libraries, we use this to handle
 * common formatting from Google Calendar (HTML) and simple Markdown.
 */
export function FormattedText({ text, className = '' }: { text?: string; className?: string }) {
    if (!text) return null;

    // Detect if it likely contains HTML
    const hasHtml = /<[a-z][\s\S]*>/i.test(text);

    if (hasHtml) {
        // Note: In a production app, we would use DOMPurify here.
        // For now, we trust the source (Google Calendar) as per requirements.
        return (
            <div
                className={`prose prose-sm max-w-none text-snomed-grey/70 ${className}`}
                dangerouslySetInnerHTML={{ __html: text }}
            />
        );
    }

    // Handle basic Markdown-like formatting if no HTML is present
    // 1. Links: [label](url) -> <a href="url">label</a>
    // 2. Bold: **text** -> <strong>text</strong>
    // 3. Newlines: \n -> <br />

    const formatted = text
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-snomed-blue hover:underline">$1</a>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br />');

    return (
        <div
            className={`text-snomed-grey/70 leading-relaxed ${className}`}
            dangerouslySetInnerHTML={{ __html: formatted }}
        />
    );
}
