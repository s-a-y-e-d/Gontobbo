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
  const hasAnyTasks = day.tasks.length > 0;

  return (
    <section className="mb-8">
      <div className="border-b border-border-subtle pb-3">
        <h2 className="font-card-title text-base text-on-surface md:text-lg">
          {day.heading}
        </h2>
      </div>

      <div className="space-y-6 pt-2">
        {hasAnyTasks ? (
          <div className="rounded-[28px] border border-border-subtle bg-white px-5">
            {day.tasks.map((task, index) => (
              <TodoAgendaTaskRow
                key={`${day.date}-task-${task.id}-${index}`}
                task={task}
                isLast={index === day.tasks.length - 1}
              />
            ))}
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
