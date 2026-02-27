'use client';

import { useState, useCallback } from 'react';
import { Plus, Trash2, CheckCircle2, Circle, Save, FileText } from 'lucide-react';
import type { EventMetadata, AgendaItem } from '@snomed/types';
import { updateEventMetadata } from '@/lib/api-client';

interface Props {
    spaceId: string;
    eventId: string;
    initialMetadata: EventMetadata;
}

export function EventForm({ spaceId, eventId, initialMetadata }: Props) {
    const [metadata, setMetadata] = useState<EventMetadata>(initialMetadata);
    const [newAgendaText, setNewAgendaText] = useState('');
    const [newAgendaResponsible, setNewAgendaResponsible] = useState('');
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const save = useCallback(async (updates: Partial<EventMetadata>) => {
        setIsSaving(true);
        setError(null);
        try {
            const updated = await updateEventMetadata(spaceId, eventId, updates);
            setMetadata(updated);
        } catch (err) {
            console.error('Failed to save event metadata:', err);
            setError('Failed to save changes. Please try again.');
        } finally {
            setIsSaving(false);
        }
    }, [spaceId, eventId]);

    const handleDocUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setMetadata({ ...metadata, googleDocUrl: e.target.value });
    };

    const handleDocUrlBlur = () => {
        if (metadata.googleDocUrl !== initialMetadata.googleDocUrl) {
            save({ googleDocUrl: metadata.googleDocUrl });
        }
    };

    const addAgendaItem = (e: React.FormEvent) => {
        e.preventDefault();
        if (!newAgendaText.trim()) return;

        const newItem: AgendaItem = {
            id: Math.random().toString(36).substring(2, 9),
            text: newAgendaText.trim(),
            responsible: newAgendaResponsible.trim() || undefined,
            completed: false,
        };

        const updatedItems = [...metadata.agendaItems, newItem];
        save({ agendaItems: updatedItems });
        setNewAgendaText('');
        setNewAgendaResponsible('');
    };

    const toggleAgendaItem = (id: string) => {
        const updatedItems = metadata.agendaItems.map((item) =>
            item.id === id ? { ...item, completed: !item.completed } : item
        );
        save({ agendaItems: updatedItems });
    };

    const deleteAgendaItem = (id: string) => {
        const updatedItems = metadata.agendaItems.filter((item) => item.id !== id);
        save({ agendaItems: updatedItems });
    };

    // Extract Doc ID for better embed
    const docIdMatch = metadata.googleDocUrl?.match(/[-\w]{25,}/);
    const embedUrl = docIdMatch ? `https://docs.google.com/document/d/${docIdMatch[0]}/preview` : null;

    return (
        <div className="space-y-8">
            {/* Google Doc Section */}
            <div className="p-6 rounded-2xl border border-snomed-border bg-white shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                    <FileText size={18} className="text-snomed-blue" />
                    <h2 className="text-lg font-semibold text-snomed-grey">Meeting Document</h2>
                </div>

                <div className="mb-6">
                    <label htmlFor="docUrl" className="block text-sm font-medium text-snomed-grey/60 mb-1.5">
                        Google Doc URL
                    </label>
                    <div className="flex gap-2">
                        <input
                            id="docUrl"
                            type="url"
                            placeholder="https://docs.google.com/document/d/..."
                            value={metadata.googleDocUrl ?? ''}
                            onChange={handleDocUrlChange}
                            onBlur={handleDocUrlBlur}
                            className="flex-1 px-4 py-2 text-sm border border-snomed-border rounded-lg focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-all"
                        />
                        <button
                            onClick={() => save({ googleDocUrl: metadata.googleDocUrl })}
                            disabled={isSaving}
                            className="px-4 py-2 bg-snomed-blue text-white text-sm font-medium rounded-lg hover:bg-snomed-blue/90 disabled:opacity-50 transition-all flex items-center gap-2"
                        >
                            <Save size={16} />
                            {isSaving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                    {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
                </div>

                {embedUrl ? (
                    <div className="w-full aspect-[4/3] sm:aspect-video rounded-lg border border-snomed-border overflow-hidden bg-gray-50">
                        <iframe
                            src={embedUrl}
                            className="w-full h-full border-none"
                            title="Meeting Document Preview"
                        />
                    </div>
                ) : metadata.googleDocUrl ? (
                    <div className="p-12 text-center bg-gray-50 rounded-lg border border-dashed border-snomed-border">
                        <p className="text-sm text-snomed-grey/50">
                            Enter a valid Google Doc URL to see a preview.
                        </p>
                    </div>
                ) : (
                    <div className="p-12 text-center bg-gray-50 rounded-lg border border-dashed border-snomed-border">
                        <p className="text-sm text-snomed-grey/50">
                            No document linked to this meeting.
                        </p>
                    </div>
                )}
            </div>

            {/* Agenda Items Section */}
            <div className="p-6 rounded-2xl border border-snomed-border bg-white shadow-sm">
                <h2 className="text-lg font-semibold text-snomed-grey mb-6">Agenda Items</h2>

                <div className="space-y-3 mb-6">
                    {metadata.agendaItems.length === 0 ? (
                        <p className="text-sm text-snomed-grey/40 text-center py-4 italic">
                            No agenda items added yet.
                        </p>
                    ) : (
                        metadata.agendaItems.map((item) => (
                            <div
                                key={item.id}
                                className="flex items-center gap-3 p-3 rounded-xl border border-snomed-border hover:border-snomed-blue/30 hover:bg-snomed-blue/[0.02] group transition-all"
                            >
                                <button
                                    onClick={() => toggleAgendaItem(item.id)}
                                    className={`flex-shrink-0 transition-colors ${item.completed ? 'text-green-500' : 'text-snomed-grey/20 hover:text-snomed-grey/40'
                                        }`}
                                >
                                    {item.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                                </button>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${item.completed ? 'text-snomed-grey/40 line-through' : 'text-snomed-grey font-medium'}`}>
                                        {item.text}
                                    </p>
                                    {item.responsible && (
                                        <p className="text-[11px] text-snomed-grey/40 mt-0.5">
                                            Responsible: <span className="font-medium text-snomed-grey/60">{item.responsible}</span>
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => deleteAgendaItem(item.id)}
                                    title="Delete item"
                                    className="p-1.5 opacity-0 group-hover:opacity-100 text-snomed-grey/20 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>

                <form onSubmit={addAgendaItem} className="flex flex-col sm:flex-row gap-3">
                    <div className="flex-1 flex flex-col gap-2">
                        <input
                            type="text"
                            placeholder="Agenda item detail..."
                            value={newAgendaText}
                            onChange={(e) => setNewAgendaText(e.target.value)}
                            className="w-full px-4 py-2 text-sm border border-snomed-border rounded-lg focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-all"
                        />
                        <input
                            type="text"
                            placeholder="Who is responsible? (optional)"
                            value={newAgendaResponsible}
                            onChange={(e) => setNewAgendaResponsible(e.target.value)}
                            className="w-full px-4 py-2 text-xs border border-snomed-border rounded-lg focus:outline-none focus:ring-2 focus:ring-snomed-blue/30 focus:border-snomed-blue transition-all bg-gray-50/50"
                        />
                    </div>
                    <button
                        type="submit"
                        disabled={!newAgendaText.trim() || isSaving}
                        className="sm:self-start px-6 py-2.5 bg-snomed-grey text-white text-sm font-medium rounded-lg hover:bg-snomed-grey/90 disabled:opacity-30 transition-all flex items-center justify-center gap-1.5 h-fit"
                    >
                        <Plus size={18} />
                        Add Item
                    </button>
                </form>
            </div>
        </div>
    );
}
