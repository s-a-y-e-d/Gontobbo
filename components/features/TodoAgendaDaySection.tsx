import TodoAgendaTaskRow from "./TodoAgendaTaskRow";
import { TodoAgendaDay } from "./todoAgendaTypes";

type TodoAgendaDaySectionProps = {
  day: TodoAgendaDay;
  onAddTask: () => void;
};

export default function TodoAgendaDaySection({
  day,
  onAddTask,
}: TodoAgendaDaySectionProps) {
  const hasScheduledTasks = day.scheduledTasks.length > 0;
  const hasUnscheduledTasks = day.unscheduledTasks.length > 0;
  const hasAnyTasks = hasScheduledTasks || hasUnscheduledTasks;

  return (
    <section className="mb-8">
      <div className="border-b border-border-subtle pb-3">
        <h2 className="font-card-title text-base text-on-surface md:text-lg">
          {day.heading}
        </h2>
      </div>

      <div className="space-y-6 pt-2">
        {hasUnscheduledTasks ? (
          <div>
            <p className="py-3 font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
              Planner Tasks
            </p>
            <div className="rounded-[28px] border border-border-subtle bg-white px-5">
              {day.unscheduledTasks.map((task, index) => (
                <TodoAgendaTaskRow
                  key={`${day.date}-unscheduled-${task.id}-${index}`}
                  task={task}
                  isLast={index === day.unscheduledTasks.length - 1}
                />
              ))}
            </div>
          </div>
        ) : null}

        {hasScheduledTasks ? (
          <div>
            <p className="py-3 font-mono-code text-[11px] uppercase tracking-[0.18em] text-gray-400">
              Scheduled
            </p>
            <div className="rounded-[28px] border border-border-subtle bg-white px-5">
              {day.scheduledTasks.map((task, index) => (
                <TodoAgendaTaskRow
                  key={`${day.date}-scheduled-${task.id}-${index}`}
                  task={task}
                  isLast={index === day.scheduledTasks.length - 1}
                />
              ))}
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={onAddTask}
          className={`flex w-full items-center gap-3 py-4 text-left transition-colors hover:opacity-85 ${
            hasAnyTasks ? "border-t border-border-subtle" : ""
          }`}
        >
          <span className="material-symbols-outlined text-[18px] text-brand-green">
            add
          </span>
          <span className="font-body text-sm text-gray-500 md:text-base">
            টাস্ক যোগ করুন
          </span>
        </button>
      </div>
    </section>
  );
}
