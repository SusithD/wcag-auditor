"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useId, useState } from "react";
import {
  EmptyState,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Tag,
} from "@/components/ds";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { isValidEmail } from "@/lib/auth/policy";
import { useSessionUser } from "@/lib/auth/user-context";
import {
  fetchMembers,
  MEMBERS_KEY,
  type Member,
  removeUserRequest,
  revokeInvite,
  sendInvite,
} from "./members-api";

function formatWhen(value: string | null): string {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Never";
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function MembersScreen() {
  const client = useQueryClient();
  const me = useSessionUser();
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<Member | null>(null);

  const members = useQuery({ queryKey: MEMBERS_KEY, queryFn: fetchMembers });
  const refresh = () => client.invalidateQueries({ queryKey: MEMBERS_KEY });

  const invite = useMutation({
    mutationFn: sendInvite,
    onSuccess: (address) => {
      setEmail("");
      setMessage(`${address} can now create an account.`);
      refresh();
    },
    onError: (error: Error) => setFieldError(error.message),
  });
  const revoke = useMutation({
    mutationFn: revokeInvite,
    onSuccess: (address) => {
      setMessage(`Invite for ${address} revoked.`);
      refresh();
    },
    onError: (error: Error) => setMessage(error.message),
  });
  const remove = useMutation({
    mutationFn: removeUserRequest,
    onSuccess: (_data, id) => {
      const gone = members.data?.users.find((u) => u.id === id);
      setMessage(`${gone?.email ?? "Member"} removed.`);
      refresh();
    },
    onError: (error: Error) => setMessage(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");
    invite.mutate(email.trim());
  }

  const users = members.data?.users ?? [];
  const invitations = members.data?.invitations ?? [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Members"
        description="Everyone who can open this workspace. Sign-up is limited to invited email addresses."
      />
      <output aria-live="polite" className="sr-only block">
        {message}
      </output>
      <div className="grid gap-4">
        <Panel aria-labelledby="mem-invite">
          <PanelHeader id="mem-invite" title="Invite someone" />
          <PanelBody>
            <form
              onSubmit={submit}
              noValidate
              className="flex flex-wrap items-start gap-3"
            >
              <div className="grid min-w-[16rem] flex-1 gap-1.5">
                <Label htmlFor={emailId}>Email address</Label>
                <Input
                  id={emailId}
                  type="email"
                  autoComplete="off"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  aria-invalid={Boolean(fieldError)}
                  aria-describedby={fieldError ? `${emailId}-err` : undefined}
                />
                {fieldError ? (
                  <p
                    id={`${emailId}-err`}
                    className="m-0 text-dense text-critical"
                  >
                    {fieldError}
                  </p>
                ) : null}
              </div>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="mt-[1.375rem]"
                disabled={invite.isPending}
              >
                Add invite
              </Button>
            </form>
          </PanelBody>
        </Panel>

        <Panel aria-labelledby="mem-invitations">
          <PanelHeader
            id="mem-invitations"
            title="Invitations"
            right={`${invitations.length} pending`}
          />
          {invitations.length === 0 ? (
            <EmptyState title="No pending invitations" as="h3">
              Add an email address above to let someone create an account.
            </EmptyState>
          ) : (
            <Table regionLabel="Invitations">
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead>Invited</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((row) => (
                  <TableRow key={row.email}>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.invitedBy}</TableCell>
                    <TableCell>{formatWhen(row.createdAt)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        aria-label={`Revoke invite for ${row.email}`}
                        onClick={() => revoke.mutate(row.email)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>

        <Panel aria-labelledby="mem-users">
          <PanelHeader
            id="mem-users"
            title="Members"
            right={`${users.length} total`}
          />
          {members.isError ? (
            <EmptyState title="Could not load members" as="h3">
              {(members.error as Error).message}
            </EmptyState>
          ) : (
            <Table regionLabel="Members">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Sign-in</TableHead>
                  <TableHead>Last sign-in</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <span className="mr-2">{row.name}</span>
                      {row.isAdmin ? <Tag>Admin</Tag> : null}
                    </TableCell>
                    <TableCell>{row.email}</TableCell>
                    <TableCell>{row.provider}</TableCell>
                    <TableCell>{formatWhen(row.lastSignIn)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="destructive"
                        disabled={row.isAdmin || row.id === me?.id}
                        aria-label={`Remove ${row.email}`}
                        onClick={() => setPending(row)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Panel>
      </div>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {pending?.email}?</AlertDialogTitle>
            <AlertDialogDescription>
              They lose access immediately and their invitation is deleted. To
              let them back in, invite them again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                if (pending) remove.mutate(pending.id);
                setPending(null);
              }}
            >
              Remove member
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
