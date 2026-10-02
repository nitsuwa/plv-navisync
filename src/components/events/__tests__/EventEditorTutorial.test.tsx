import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EventEditorTutorial } from "../EventEditorTutorial";
it("remembers completion per account and permits replay",()=>{
 localStorage.clear();
 const view=render(<EventEditorTutorial accountId="org-one"/>);
 expect(screen.getByRole("dialog")).toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Skip tour"}));
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 view.unmount();
 render(<EventEditorTutorial accountId="org-one"/>);
 expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
 fireEvent.click(screen.getByRole("button",{name:"Editor help"}));
 expect(screen.getByRole("dialog")).toBeInTheDocument();
});
