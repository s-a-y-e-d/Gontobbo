"use client";

import React from "react";
import SubjectCard, { SubjectCardProps } from "./SubjectCard";

type SubjectGridProps = {
  subjects: SubjectCardProps[];
};

export default function SubjectGrid({ subjects }: SubjectGridProps) {
  if (!subjects || subjects.length === 0) {
    return (
      <div className="py-12 text-center text-gray-500">
        No subjects found. Start by adding a new subject.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-gap-component">
      {subjects.map((subject) => (
        <SubjectCard key={subject._id} {...subject} />
      ))}
    </div>
  );
}
