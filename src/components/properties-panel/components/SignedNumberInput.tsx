import React from "react";
import {
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import NumberInput from "./NumberInput";

interface SignedNumberInputProps {
  label: string;
  /** Signed value: the magnitude is shown in the field, the sign drives the switch. */
  value: number;
  onChange: (value: number) => void;
  step?: number;
  large?: boolean;
  suffix?: string;
  accent?: boolean;
}

/**
 * Magnitude field + direction switch for a signed quantity (motor speed, moment).
 * The field always displays the magnitude; the sense of rotation is carried by
 * the switch icon alone, and a negative value typed into the field is folded
 * back into the switch.
 */
export const SignedNumberInput: React.FC<SignedNumberInputProps> = ({
  label,
  value,
  onChange,
  step,
  large,
  suffix,
  accent,
}) => {
  const clockwise = value >= 0;
  const DirectionIcon = clockwise ? RotateRightIcon : RotateLeftIcon;

  // The field shows the magnitude, but still accepts a typed sign: entering a
  // negative flips the switch rather than showing a negative number. The arrows
  // step the magnitude, so stepping below zero flips the switch too.
  const handleChange = (entered: number) => {
    const flip = entered < 0;
    const magnitude = Math.abs(entered);
    const nextClockwise = flip ? !clockwise : clockwise;
    onChange(nextClockwise ? magnitude : -magnitude);
  };

  return (
    <NumberInput
      label={label}
      value={Math.abs(value)}
      onChange={handleChange}
      step={step}
      large={large}
      suffix={suffix}
      accent={accent}
      signed={true}
      adornment={{
        icon: DirectionIcon,
        title: clockwise ? "Horaire" : "Anti-horaire",
        onClick: () => onChange(-value),
        color: "secondary",
      }}
    />
  );
};

export default SignedNumberInput;
