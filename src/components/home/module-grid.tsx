import { CORE_MODULES } from "@/lib/constants";

export function ModuleGrid() {
  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {CORE_MODULES.map((module) => (
        <div key={module} className="glass rounded-2xl p-5">
          <p className="text-sm font-medium text-brand">Core module</p>
          <h3 className="mt-2 text-lg font-semibold tracking-tight">{module}</h3>
        </div>
      ))}
    </section>
  );
}
