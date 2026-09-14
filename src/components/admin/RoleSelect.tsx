"use client";

export function RoleSelect({ value }: { value: "ADMIN" | "USER" }) {
  return (
    <select
      name="role"
      defaultValue={value}
      onChange={(event) => event.currentTarget.form?.requestSubmit()}
      className="field w-auto py-1.5 text-xs"
    >
      <option value="ADMIN">Admin</option>
      <option value="USER">Vendedor</option>
    </select>
  );
}
