"use client";

import React, { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";

type AddSubjectModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .trim();
}

export default function AddSubjectModal({ isOpen, onClose }: AddSubjectModalProps) {
  const createSubject = useMutation(api.mutations.createSubject);
  
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("menu_book");
  const [color, setColor] = useState("green");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      await createSubject({
        name,
        slug: slugify(name),
        icon,
        color,
        order: Date.now(), // Use timestamp for ordering new subjects
        chapterTrackers: [
          { key: "mcq", label: "MCQ", avgMinutes: 30 },
          { key: "cq", label: "সৃজনশীল", avgMinutes: 45 },
          { key: "note", label: "নোট", avgMinutes: 20 },
        ],
        conceptTrackers: [
          { key: "class", label: "ক্লাস নোট", avgMinutes: 20 },
          { key: "book", label: "বই", avgMinutes: 25 },
        ],
      });
      setName("");
      onClose();
    } catch (error) {
      console.error("Failed to create subject:", error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-pure-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b border-border-subtle">
          <h2 className="font-card-title text-card-title text-on-surface">Add Subject</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 transition-colors"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">Subject Name</label>
            <input 
              type="text" 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-border-medium rounded-lg focus:outline-none focus:border-brand-green"
              placeholder="e.g. Physics 1st Paper"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">Icon (Material)</label>
              <input 
                type="text" 
                required
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-4 py-2 border border-border-medium rounded-lg focus:outline-none focus:border-brand-green"
              />
            </div>
            <div>
              <label className="block font-label-uppercase text-label-uppercase text-gray-500 mb-2">Theme</label>
              <select 
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="w-full px-4 py-2 border border-border-medium rounded-lg focus:outline-none focus:border-brand-green bg-white"
              >
                <option value="green">Green</option>
                <option value="blue">Blue</option>
                <option value="red">Red</option>
                <option value="gray">Gray</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-full font-label-uppercase text-label-uppercase text-gray-700 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2.5 rounded-full font-label-uppercase text-label-uppercase text-pure-white bg-on-surface hover:bg-brand-green transition-colors disabled:opacity-50"
            >
              {isSubmitting ? "Adding..." : "Add Subject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
