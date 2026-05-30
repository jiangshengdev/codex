import type { JSX } from "react";
import { Button, ButtonGroup, Label, NumberField } from "@heroui/react";
import { CirclePlus, Minus, Plus, Shuffle, Timer } from "lucide-react";
import { useState } from "react";
import { useAppDispatch, useAppSelector } from "@/app/hooks";
import {
  decrement,
  increment,
  incrementAsync,
  incrementByAmount,
  incrementIfOdd,
  selectCount,
  selectStatus,
} from "./counterSlice";

export const Counter = (): JSX.Element => {
  const dispatch = useAppDispatch();
  const count = useAppSelector(selectCount);
  const status = useAppSelector(selectStatus);
  const [incrementAmount, setIncrementAmount] = useState<number | undefined>(2);

  const incrementValue = incrementAmount ?? 0;

  return (
    <div className="grid justify-items-center gap-4">
      <div className="flex items-center justify-center gap-4">
        <ButtonGroup variant="tertiary">
          <Button isIconOnly aria-label="Decrement value" onPress={() => dispatch(decrement())}>
            <Minus aria-hidden="true" size={18} />
          </Button>
        </ButtonGroup>
        <label
          aria-label="Count"
          className="mt-0.5 px-4 font-mono text-[78px] leading-none tabular-nums"
        >
          {count}
        </label>
        <ButtonGroup variant="tertiary">
          <Button isIconOnly aria-label="Increment value" onPress={() => dispatch(increment())}>
            <Plus aria-hidden="true" size={18} />
          </Button>
        </ButtonGroup>
      </div>
      <NumberField
        aria-label="Set increment amount"
        className="w-fit items-stretch"
        value={incrementAmount}
        onChange={setIncrementAmount}
      >
        <Label>Set increment amount</Label>
        <NumberField.Group>
          <NumberField.DecrementButton />
          <NumberField.Input />
          <NumberField.IncrementButton />
        </NumberField.Group>
      </NumberField>
      <ButtonGroup variant="tertiary">
        <Button onPress={() => dispatch(incrementByAmount(incrementValue))}>
          <CirclePlus aria-hidden="true" size={18} />
          Add Amount
        </Button>
        <Button
          isDisabled={status !== "idle"}
          onPress={() => {
            void dispatch(incrementAsync(incrementValue));
          }}
        >
          <ButtonGroup.Separator />
          <Timer aria-hidden="true" size={18} />
          Add Async
        </Button>
        <Button
          onPress={() => {
            dispatch(incrementIfOdd(incrementValue));
          }}
        >
          <ButtonGroup.Separator />
          <Shuffle aria-hidden="true" size={18} />
          Add If Odd
        </Button>
      </ButtonGroup>
    </div>
  );
};
