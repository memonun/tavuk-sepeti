"use client";

import { useEffect, useState } from "react";
import type { AgendaCategory } from "@/features/agenda/domain/agenda-task";
import type { AgendaTask } from "@/features/agenda/domain/agenda-task";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

const CATEGORIES: { key: AgendaCategory; icon: string; name: string }[] = [
  { key: "genel", icon: "📋", name: "Genel İşler" },
  { key: "hayvan_sagligi", icon: "🐔", name: "Hayvan Sağlığı" },
  { key: "kumes_bakimi", icon: "🏠", name: "Kümes Bakımı" },
  { key: "satis_teslimat", icon: "📦", name: "Satış & Teslimat" },
  { key: "alisveris", icon: "🛒", name: "Alışveriş" },
];

interface CategoryTasks {
  category: AgendaCategory;
  tasks: AgendaTask[];
}

export function YapilacaklarList() {
  const [categoryTasks, setCategoryTasks] = useState<CategoryTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({});
  const [savingCategory, setSavingCategory] = useState<string | null>(null);

  useEffect(() => {
    const loadTasks = async () => {
      try {
        const response = await fetch(`/api/agenda/tasks`);
        if (!response.ok) throw new Error("Yükleme başarısız");

        const tasks: AgendaTask[] = await response.json();
        const openTasks = tasks.filter((t) => !t.completed_at);

        const grouped = CATEGORIES.map((cat) => ({
          category: cat.key,
          tasks: openTasks.filter((t) => t.category === cat.key),
        }));

        setCategoryTasks(grouped);
      } catch (error) {
        console.error("Görevler yüklenemedi:", error);
      } finally {
        setLoading(false);
      }
    };

    loadTasks();
  }, []);

  const refreshTasks = async () => {
    try {
      const response = await fetch(`/api/agenda/tasks`);
      if (!response.ok) throw new Error("Yükleme başarısız");
      const tasks: AgendaTask[] = await response.json();
      const openTasks = tasks.filter((t) => !t.completed_at);

      const grouped = CATEGORIES.map((cat) => ({
        category: cat.key,
        tasks: openTasks.filter((t) => t.category === cat.key),
      }));
      setCategoryTasks(grouped);
    } catch (error) {
      console.error("Görevler yüklenemedi:", error);
    }
  };

  const handleAddTask = async (category: AgendaCategory) => {
    const title = newTaskInputs[category]?.trim();
    if (!title) return;

    setSavingCategory(category);
    try {
      const response = await fetch("/api/agenda/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          notes: null,
          category,
          due_date: null,
          repeat_unit: null,
          repeat_every: null,
        }),
      });

      if (response.ok) {
        setNewTaskInputs((prev) => ({
          ...prev,
          [category]: "",
        }));
        await refreshTasks();
      }
    } catch (error) {
      console.error("Görev eklenemedi:", error);
    } finally {
      setSavingCategory(null);
    }
  };

  const handleToggleComplete = async (taskId: string, currentStatus: boolean) => {
    try {
      const response = await fetch(`/api/agenda/tasks/${taskId}/complete`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          completed: !currentStatus,
        }),
      });

      if (response.ok) {
        await refreshTasks();
      }
    } catch (error) {
      console.error("Görev durumu güncellenemedi:", error);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Yükleniyor...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold mb-4">📋 Yapılacaklar Listesi</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Kategoriye göre görevleri yönet. Yeni görev eklemek için inputu doldur ve butona tıkla.
        </p>
      </div>

      <div className="grid gap-6">
        {categoryTasks.map(({ category, tasks }) => {
          const catInfo = CATEGORIES.find((c) => c.key === category);
          return (
            <div key={category} className="border rounded-lg p-4 bg-card">
              <h4 className="text-base font-semibold mb-3">
                {catInfo?.icon} {catInfo?.name}
              </h4>

              {/* Task List */}
              {tasks.length > 0 && (
                <div className="space-y-2 mb-4">
                  {tasks.map((task) => (
                    <div
                      key={task.id}
                      className="flex items-center gap-3 p-2 rounded hover:bg-accent/50"
                    >
                      <Checkbox
                        id={task.id}
                        checked={!!task.completed_at}
                        onCheckedChange={() =>
                          handleToggleComplete(task.id, !!task.completed_at)
                        }
                      />
                      <label
                        htmlFor={task.id}
                        className={`flex-1 cursor-pointer ${
                          task.completed_at
                            ? "line-through text-muted-foreground"
                            : ""
                        }`}
                      >
                        {task.title}
                      </label>
                      {task.notes && (
                        <span className="text-xs text-muted-foreground">
                          {task.notes}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Add New Task */}
              <div className="flex gap-2 pt-2 border-t">
                <Input
                  placeholder={`Yeni ${catInfo?.name?.toLowerCase()} ekle...`}
                  value={newTaskInputs[category] ?? ""}
                  onChange={(e) =>
                    setNewTaskInputs((prev) => ({
                      ...prev,
                      [category]: e.target.value,
                    }))
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleAddTask(category);
                    }
                  }}
                  className="text-sm"
                />
                <Button
                  size="sm"
                  onClick={() => handleAddTask(category)}
                  disabled={savingCategory === category}
                >
                  {savingCategory === category ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Ekle"
                  )}
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
