import { setUserRole, toggleUserActive } from "@/app/actions/users";
import { RoleSelect } from "@/components/admin/RoleSelect";
import { PageHeader } from "@/components/shell/PageHeader";
import { allowedDomain, requireUser } from "@/lib/auth";
import { getUsers } from "@/lib/queries";

export default async function UsersPage() {
  const me = await requireUser("admin");
  const users = await getUsers();

  return (
    <>
      <PageHeader
        title="Usuários"
        subtitle={`Contas do time — cadastro liberado para e-mails @${allowedDomain()}`}
      />

      <div className="card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold text-muted">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Leads</th>
              <th className="px-4 py-3">Negócios</th>
              <th className="px-4 py-3">Tarefas</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => {
              const isMe = user.id === me.id;

              return (
                <tr
                  key={user.id}
                  className={`border-b border-line last:border-b-0 ${user.active ? "" : "opacity-55"}`}
                >
                  <td className="px-4 py-3 font-medium">
                    {user.name}
                    {isMe && <span className="ml-2 text-xs text-muted">(você)</span>}
                  </td>
                  <td className="px-4 py-3 text-muted">{user.email}</td>
                  <td className="px-4 py-3">
                    <form action={setUserRole}>
                      <input type="hidden" name="userId" value={user.id} />
                      <RoleSelect value={user.role} />
                    </form>
                  </td>
                  <td className="px-4 py-3 text-muted">{user._count.leads}</td>
                  <td className="px-4 py-3 text-muted">{user._count.deals}</td>
                  <td className="px-4 py-3 text-muted">{user._count.tasks}</td>
                  <td className="px-4 py-3">
                    <form action={toggleUserActive}>
                      <input type="hidden" name="userId" value={user.id} />
                      <button
                        type="submit"
                        disabled={isMe}
                        className={`chip transition disabled:cursor-not-allowed disabled:opacity-60 ${
                          user.active
                            ? "bg-waz-95 text-waz-20 hover:bg-waz-90"
                            : "bg-surface-2 text-muted hover:bg-line"
                        }`}
                      >
                        {user.active ? "Ativo" : "Inativo"}
                      </button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-xs text-muted">
        O nível é salvo assim que você troca o seletor. Desativar uma conta encerra as
        sessões abertas imediatamente.
      </p>
    </>
  );
}
