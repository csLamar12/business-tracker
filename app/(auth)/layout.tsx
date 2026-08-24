export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold">Business Tracker</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            AnchorPoint Systems
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
