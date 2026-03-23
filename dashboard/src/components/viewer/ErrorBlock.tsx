interface ErrorBlockProps {
  message: string;
}

export function ErrorBlock({ message }: ErrorBlockProps) {
  return (
    <div className="text-dt-red bg-dt-red-dim rounded-dt-sm px-2.5 py-2 my-1.5 border-l-2 border-dt-red font-mono text-xs leading-[1.6] whitespace-pre-wrap break-words">
      {message}
    </div>
  );
}
