interface UserMessageProps {
  content: string
}

export function UserMessage({ content }: UserMessageProps) {
  return (
    <div className="flex justify-end mb-4 px-4">
      <div className="max-w-[75%]">
        <div className="bg-[#6c5ce7] text-white rounded-2xl rounded-br-md px-4 py-2.5 shadow-sm">
          <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </p>
        </div>
      </div>
    </div>
  )
}
