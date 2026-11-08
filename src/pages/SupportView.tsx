import { IonAlert, IonBadge, IonButton, IonIcon, IonInput, IonItem, IonSelect, IonSelectOption, IonSpinner, IonTextarea } from '@ionic/react';
import { chatbubblesOutline, checkmarkCircleOutline, sendOutline, trashOutline } from 'ionicons/icons';
import { equalTo, onValue, orderByChild, push, query, ref, remove, set, update } from 'firebase/database';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useAuth } from '../auth/useAuth';
import { database } from '../firebase';

type SupportCategory = 'Account' | 'Seed allocation' | 'Delivery' | 'Other';
type SupportStatus = 'open' | 'closed';

interface SupportMessage {
  id: string;
  senderUid: string;
  senderName: string;
  senderRole: 'admin' | 'farmer';
  text: string;
  createdAt: string;
}

interface SupportTicket {
  id: string;
  requesterUid: string;
  requesterName: string;
  subject: string;
  category: SupportCategory;
  status: SupportStatus;
  createdAt: string;
  updatedAt: string;
  openingMessage?: Omit<SupportMessage, 'id'>;
  messages: SupportMessage[];
}

const storageKey = 'seedlink-support-tickets';
const categories: SupportCategory[] = ['Account', 'Seed allocation', 'Delivery', 'Other'];

function readLocalTickets(): SupportTicket[] {
  const saved = window.localStorage.getItem(storageKey);
  if (!saved) return [];
  const parsed: unknown = JSON.parse(saved);
  if (!Array.isArray(parsed)) throw new Error('Saved support conversations are not in a valid format.');
  return parsed as SupportTicket[];
}

const SupportView: React.FC = () => {
  const { user, profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [isCreatingTicket, setIsCreatingTicket] = useState(false);
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportCategory>('Other');
  const [draft, setDraft] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pendingDeleteTicket, setPendingDeleteTicket] = useState<SupportTicket | null>(null);
  const [isDeletingTicket, setIsDeletingTicket] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user || !profile) return;
    if (!database) {
      try {
        const ownTickets = readLocalTickets().filter((ticket) => isAdmin || ticket.requesterUid === user.uid);
        setTickets(ownTickets);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'Could not load support conversations.');
      }
      return;
    }

    const ticketsRef = ref(database, 'supportTickets');
    const ticketsQuery = isAdmin
      ? ticketsRef
      : query(ticketsRef, orderByChild('requesterUid'), equalTo(user.uid));
    return onValue(ticketsQuery, (snapshot) => {
      const records = snapshot.val() as Record<string, Omit<SupportTicket, 'id' | 'messages'> & { messages?: Record<string, Omit<SupportMessage, 'id'>> }> | null;
      const nextTickets = Object.entries(records ?? {}).map(([id, ticket]) => ({
        ...ticket,
        id,
        messages: [
          ...(ticket.openingMessage ? [{ ...ticket.openingMessage, id: 'initial' }] : []),
          ...Object.entries(ticket.messages ?? {}).map(([messageId, message]) => ({ ...message, id: messageId })),
        ],
      }));
      nextTickets.sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
      setTickets(nextTickets);
      setError('');
    }, (loadError) => setError(`Could not load support conversations: ${loadError.message}`));
  }, [isAdmin, profile, user]);

  const selectedTicket = useMemo(
    () => tickets.find((ticket) => ticket.id === selectedId) ?? null,
    [selectedId, tickets],
  );

  useEffect(() => {
    if (!selectedId && tickets.length && !isCreatingTicket) setSelectedId(tickets[0].id);
    if (selectedId && !tickets.some((ticket) => ticket.id === selectedId)) {
      setSelectedId(tickets[0]?.id ?? '');
    }
  }, [isCreatingTicket, selectedId, tickets]);

  const storeLocalTickets = (nextTickets: SupportTicket[]) => {
    window.localStorage.setItem(storageKey, JSON.stringify(nextTickets));
    setTickets(nextTickets.filter((ticket) => isAdmin || ticket.requesterUid === user?.uid)
      .sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)));
  };

  const submitMessage = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user || !profile || isSubmitting) return;
    const text = draft.trim();
    if (!text || text.length > 1000) {
      setError('Write a message between 1 and 1,000 characters.');
      return;
    }

    if (!selectedTicket && !isAdmin && (!subject.trim() || subject.trim().length > 80)) {
      setError('Add a subject between 1 and 80 characters.');
      return;
    }
    if (selectedTicket?.status === 'closed') {
      setError('This conversation is closed. Ask the administrator to reopen it before replying.');
      return;
    }

    setIsSubmitting(true);
    setError('');
    const timestamp = new Date().toISOString();
    const message: Omit<SupportMessage, 'id'> = {
      senderUid: user.uid,
      senderName: profile.displayName,
      senderRole: isAdmin ? 'admin' : 'farmer',
      text,
      createdAt: timestamp,
    };

    try {
      if (!database) {
        const localTickets = readLocalTickets();
        if (selectedTicket) {
          const updatedTicket = { ...selectedTicket, updatedAt: timestamp, messages: [...selectedTicket.messages, { ...message, id: `message-${Date.now()}` }] };
          storeLocalTickets(localTickets.map((ticket) => ticket.id === selectedTicket.id ? updatedTicket : ticket));
        } else {
          const id = `ticket-${Date.now()}`;
          const newTicket: SupportTicket = {
            id,
            requesterUid: user.uid,
            requesterName: profile.displayName,
            subject: subject.trim(),
            category,
            status: 'open',
            createdAt: timestamp,
            updatedAt: timestamp,
            messages: [{ ...message, id: `message-${Date.now()}` }],
          };
          storeLocalTickets([newTicket, ...localTickets]);
          setSelectedId(id);
          setIsCreatingTicket(false);
          setSubject('');
          setCategory('Other');
        }
      } else if (selectedTicket) {
        const messagesRef = ref(database, `supportTickets/${selectedTicket.id}/messages`);
        const messageRef = push(messagesRef);
        await set(messageRef, message);
        await update(ref(database, `supportTickets/${selectedTicket.id}`), { updatedAt: timestamp });
      } else {
        const ticketRef = push(ref(database, 'supportTickets'));
        if (!ticketRef.key) throw new Error('Could not create a support conversation.');
        await set(ticketRef, {
          requesterUid: user.uid,
          requesterName: profile.displayName,
          subject: subject.trim(),
          category,
          status: 'open',
          createdAt: timestamp,
          updatedAt: timestamp,
          openingMessage: message,
        });
        setSelectedId(ticketRef.key);
        setIsCreatingTicket(false);
        setSubject('');
        setCategory('Other');
      }
      setDraft('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not send this message.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const toggleStatus = async () => {
    if (!selectedTicket || !isAdmin) return;
    const status: SupportStatus = selectedTicket.status === 'open' ? 'closed' : 'open';
    const timestamp = new Date().toISOString();
    setError('');
    try {
      if (!database) {
        const localTickets = readLocalTickets().map((ticket) => ticket.id === selectedTicket.id
          ? { ...ticket, status, updatedAt: timestamp }
          : ticket);
        storeLocalTickets(localTickets);
      } else {
        await update(ref(database, `supportTickets/${selectedTicket.id}`), { status, updatedAt: timestamp });
      }
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : 'Could not update the conversation status.');
    }
  };

  const deleteTicket = async () => {
    if (!pendingDeleteTicket || isDeletingTicket) return;
    const ticketToDelete = pendingDeleteTicket;
    setIsDeletingTicket(true);
    setError('');
    try {
      if (!database) {
        storeLocalTickets(readLocalTickets().filter((ticket) => ticket.id !== ticketToDelete.id));
      } else {
        await remove(ref(database, `supportTickets/${ticketToDelete.id}`));
      }
      if (selectedId === ticketToDelete.id) {
        const remainingTicket = tickets.find((ticket) => ticket.id !== ticketToDelete.id);
        setSelectedId(remainingTicket?.id ?? '');
      }
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Could not delete this conversation.');
    } finally {
      setIsDeletingTicket(false);
      setPendingDeleteTicket(null);
    }
  };

  const supportIntro = isAdmin
    ? 'Reply to farmer questions and keep each conversation organized.'
    : 'Send a private message to the SeedLink administration team.';

  return (
    <section className="support-view">
      <header className="support-intro">
        <span className="support-icon"><IonIcon icon={chatbubblesOutline} /></span>
        <div><h2>Customer service</h2><p>{supportIntro}</p></div>
        {!database && <IonBadge color="warning">Local demo</IonBadge>}
      </header>
      {error && <p className="support-error" role="alert">{error}</p>}
      <div className="support-inbox">
        <aside className="support-list-panel" aria-label="Support conversations">
          <div className="support-list-heading">
            <h3>{isAdmin ? 'Farmer conversations' : 'Your conversations'}</h3>
            <span>{tickets.length}</span>
            {!isAdmin && <IonButton fill="clear" size="small" onClick={() => { setSelectedId(''); setIsCreatingTicket(true); setSubject(''); setDraft(''); }}>New</IonButton>}
          </div>
          {tickets.length ? tickets.map((ticket) => (
            <button
              type="button"
              key={ticket.id}
              className={`support-ticket ${selectedTicket?.id === ticket.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedId(ticket.id)}
            >
              <span className="support-ticket-top"><strong>{ticket.subject}</strong><IonBadge color={ticket.status === 'open' ? 'success' : 'medium'}>{ticket.status}</IonBadge></span>
              <span>{isAdmin ? ticket.requesterName : ticket.category}</span>
              <small>{ticket.messages.at(-1)?.text ?? 'No messages yet'}</small>
            </button>
          )) : <p className="support-empty">No conversations yet.</p>}
          {!isAdmin && (isCreatingTicket || tickets.length === 0) && <div className="support-new-ticket">
            <h4>Start a conversation</h4>
            <IonItem className="form-field" lines="none"><IonInput label="Subject" labelPlacement="stacked" value={subject} maxlength={80} onIonInput={(event) => setSubject(event.detail.value ?? '')} /></IonItem>
            <IonItem className="form-field" lines="none"><IonSelect label="Topic" labelPlacement="stacked" value={category} onIonChange={(event) => setCategory(event.detail.value)}>{categories.map((item) => <IonSelectOption key={item} value={item}>{item}</IonSelectOption>)}</IonSelect></IonItem>
          </div>}
        </aside>
        <section className="support-conversation" aria-label="Conversation">
          {selectedTicket && !isCreatingTicket ? <>
            <header className="support-conversation-heading">
              <div><h3>{selectedTicket.subject}</h3><p>{selectedTicket.category} · {isAdmin ? selectedTicket.requesterName : 'SeedLink customer service'}</p></div>
              <div className="support-conversation-actions">
                {isAdmin && <IonButton fill="outline" size="small" onClick={() => void toggleStatus()}>{selectedTicket.status === 'open' ? 'Close conversation' : 'Reopen conversation'}</IonButton>}
                <IonButton
                  fill="outline"
                  color="danger"
                  size="small"
                  onClick={() => setPendingDeleteTicket(selectedTicket)}
                  aria-label={`Delete conversation: ${selectedTicket.subject}`}
                  title="Delete conversation"
                >
                  <IonIcon slot="icon-only" icon={trashOutline} />
                </IonButton>
              </div>
            </header>
            <div className="support-messages" aria-live="polite">
              {selectedTicket.messages.map((message) => (
                <article key={message.id} className={`support-message ${message.senderUid === user?.uid ? 'is-own' : ''}`}>
                  <div className="support-message-meta"><strong>{message.senderName}</strong><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString()}</time></div>
                  <p>{message.text}</p>
                </article>
              ))}
            </div>
            {selectedTicket.status === 'closed' ? (
              <p className="support-closed"><IonIcon icon={checkmarkCircleOutline} /> This conversation is closed. {isAdmin ? 'Reopen it to send another reply.' : 'Contact the administrator if you need more help.'}</p>
            ) : <form className="support-reply" onSubmit={(event) => void submitMessage(event)}>
              <IonItem className="form-field" lines="none"><IonTextarea label="Message" labelPlacement="stacked" placeholder="Write your message..." value={draft} maxlength={1000} rows={3} onIonInput={(event) => setDraft(event.detail.value ?? '')} /></IonItem>
              <IonButton className="save-button" type="submit" disabled={isSubmitting || !draft.trim()}>{isSubmitting ? <IonSpinner name="dots" /> : <><IonIcon slot="start" icon={sendOutline} />Send message</>}</IonButton>
            </form>}
          </> : isAdmin ? <div className="support-no-selection"><IonIcon icon={chatbubblesOutline} /><h3>All caught up</h3><p>Farmer conversations will appear here when someone reaches out.</p></div> : <form className="support-new-conversation" onSubmit={(event) => void submitMessage(event)}>
            <h3>How can we help?</h3>
            <p>Your message will be sent privately to the SeedLink administration team.</p>
            <IonItem className="form-field" lines="none"><IonTextarea label="Message" labelPlacement="stacked" placeholder="Tell us what you need help with..." value={draft} maxlength={1000} rows={5} onIonInput={(event) => setDraft(event.detail.value ?? '')} /></IonItem>
            <IonButton className="save-button" type="submit" disabled={isSubmitting || !subject.trim() || !draft.trim()}>{isSubmitting ? <IonSpinner name="dots" /> : <><IonIcon slot="start" icon={sendOutline} />Send to customer service</>}</IonButton>
          </form>}
        </section>
      </div>
      <p className="support-privacy">Messages are visible only to you and SeedLink administrators.</p>
      <IonAlert
        isOpen={pendingDeleteTicket !== null}
        header="Delete conversation?"
        message={pendingDeleteTicket ? `"${pendingDeleteTicket.subject}" and all of its messages will be permanently deleted.` : ''}
        buttons={[
          { text: 'Cancel', role: 'cancel' },
          { text: 'Delete conversation', role: 'destructive', handler: () => { void deleteTicket(); } },
        ]}
        onDidDismiss={() => { if (!isDeletingTicket) setPendingDeleteTicket(null); }}
      />
    </section>
  );
};

export default SupportView;
