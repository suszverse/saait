"use client";

import { useActionState } from "react";
import { Button, TextField } from "@/components/ui";
import { requestCode, verifyCode, type LoginState } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [phoneState, sendCode, sending] = useActionState(requestCode, { step: "phone", next } as LoginState);
  const [codeState, checkCode, checking] = useActionState(verifyCode, { step: "code", next } as LoginState);
  const onCode = phoneState.step === "code";

  if (!onCode) {
    return (
      <form action={sendCode} className="flex flex-col gap-4">
        <input type="hidden" name="next" value={next} />
        <TextField
          id="phone"
          name="phone"
          label="Mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="98XXXXXXXX"
          helper="We send a 6-digit code here by SMS."
          error={phoneState.error}
          required
        />
        <Button variant="secondary" disabled={sending} type="submit">
          {sending ? "Sending" : "Send code"}
        </Button>
      </form>
    );
  }

  return (
    <form action={checkCode} className="flex flex-col gap-4">
      <input type="hidden" name="next" value={next} />
      <TextField
        id="code"
        name="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        helper={`Sent to ${phoneState.phone?.replace("+977", "")}. It expires in 5 minutes.`}
        error={codeState.error}
        required
        autoFocus
      />
      <Button variant="secondary" disabled={checking} type="submit">
        {checking ? "Checking" : "Sign in"}
      </Button>
    </form>
  );
}
