'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getPublicChannelCutoff } from '@/lib/chat'
import type { UserRole, MessageWithSender } from '@/lib/types'

type Channel = 'public' | 'owner' | 'kitchen'

const CHANNEL_LABELS: Record<Channel, string> = {
  public: 'Chung',
  kitchen: 'Bếp',
  owner: 'Chủ quán',
}

function availableChannels(role: UserRole): Channel[] {
  if (role === 'owner') return ['owner']
  if (role === 'manager') return ['public', 'kitchen', 'owner']
  return ['public', 'kitchen']
}

interface Props {
  role: UserRole
  branchId: string
  onClose: () => void
  initialText?: string
}

export function ChatPanel({ role, branchId, onClose, initialText }: Props) {
  const [channel, setChannel] = useState<Channel>(role === 'owner' ? 'owner' : 'public')
  const [messages, setMessages] = useState<MessageWithSender[]>([])
  const [text, setText] = useState(initialText ?? '')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [sendError, setSendError] = useState(false)
  const supabase = createClient()
  const listEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUserId(user?.id ?? null))
  }, [])

  useEffect(() => {
    let cancelled = false

    async function loadMessages() {
      let query = supabase
        .from('messages')
        .select('*, sender:user_profiles(full_name, role)')
        .eq('branch_id', branchId)
        .eq('channel', channel)
        .order('created_at', { ascending: true })

      if (channel === 'public' || channel === 'kitchen') {
        query = query.gte('created_at', getPublicChannelCutoff(new Date()).toISOString())
      }

      const { data } = await query
      // Guards against a slow response from a channel the user has since
      // switched away from landing after a newer one and clobbering it.
      if (!cancelled && data) setMessages(data as MessageWithSender[])
    }

    loadMessages()

    const realtimeChannel = supabase
      .channel(`messages-${branchId}-${channel}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `branch_id=eq.${branchId}` },
        () => loadMessages(),
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(realtimeChannel) }
  }, [branchId, channel])

  useEffect(() => {
    listEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend() {
    const trimmed = text.trim()
    if (!trimmed) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { error } = await supabase.from('messages').insert({ branch_id: branchId, channel, sender_id: user.id, body: trimmed })
    if (error) {
      setSendError(true)
      setTimeout(() => setSendError(false), 4000)
      return
    }
    setText('')
  }

  const channels = availableChannels(role)

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm bg-surface h-full flex flex-col shadow-lg">
        <div className="p-stack-lg border-b border-outline-variant">
          <h3 className="text-headline-md font-bold text-on-surface mb-1">Trò chuyện</h3>

          {channels.length > 1 && (
            <div className="flex gap-2 mt-2">
              {channels.map(c => (
                <button
                  key={c}
                  onClick={() => setChannel(c)}
                  className={`px-4 py-1 rounded-full text-label-vi font-bold ${
                    channel === c ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface-variant'
                  }`}
                >
                  {CHANNEL_LABELS[c]}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-stack-lg space-y-2">
          {messages.length === 0 && (
            <p className="text-label-en text-on-surface-variant text-center mt-stack-lg">Chưa có tin nhắn nào</p>
          )}
          {messages.map(msg => {
            const isMine = msg.sender_id === currentUserId
            return (
              <div key={msg.id} className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                <span className="text-label-en text-on-surface-variant mb-0.5">
                  {msg.sender.full_name ?? 'Người dùng'}
                </span>
                <span
                  className={`max-w-[80%] rounded-xl px-3 py-2 text-label-vi ${
                    isMine ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface'
                  }`}
                >
                  {msg.body}
                </span>
              </div>
            )
          })}
          <div ref={listEndRef} />
        </div>

        {sendError && (
          <p className="px-stack-lg py-1 text-label-en text-error">Không thể gửi tin nhắn. Vui lòng thử lại.</p>
        )}

        <div className="p-stack-lg border-t border-outline-variant flex gap-2">
          <input
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSend() }}
            placeholder="Nhập tin nhắn..."
            className="flex-1 border border-outline-variant rounded-lg px-3 py-2 text-label-vi bg-surface-container-lowest text-on-surface focus:outline-none focus:ring-2 focus:ring-primary min-h-touch-target-min"
          />
          <button
            onClick={handleSend}
            className="bg-primary text-on-primary rounded-lg px-4 font-bold text-label-vi min-h-touch-target-min"
          >
            Gửi
          </button>
        </div>
      </div>
    </div>
  )
}
