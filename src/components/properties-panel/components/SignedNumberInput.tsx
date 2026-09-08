import React from "react";
import {
  RotateLeft as RotateLeftIcon,
  RotateRight as RotateRightIcon,
} from "@mui/icons-material";
import NumberInput from "./NumberInput";
import { QuantityKind } from "../../../utils/quantity-format";
import { t } from "../../../i18n";

interface SignedNumberInputProps {
  label: string;
  title: string;
  /** Signed value: the magnitude is shown in the field, the sign drives the switch. */
  value: number;
  onChange: (value: number) => void;
  step?: number;
  large?: boolean;
  accent?: boolean;
  kind?: QuantityKind;
  mixed?: boolean;
  /** See `NumberInput`'s own `alert`. */
  alert?: boolean;
}

/**
 * Magnitude field + direction switch for a signed quantity (motor speed, moment).
 * The field always displays the magnitude; the sense of rotation is carried by the switch icon alone, and a negative value typed into the field is folded back into the switch.
 */
export const SignedNumberInput: React.FC<SignedNumberInputProps> = ({
  label,
  title,
  value,
  onChange,
  step,
  large = false,
  accent = false,
  kind,
  mixed = false,
  alert = false,
}) => {
  const clockwise = value >= 0;
  const DirectionIcon = clockwise ? RotateRightIcon : RotateLeftIcon;

  // The field shows the magnitude, but still accepts a typed sign: entering a negative flips the switch rather than showing a negative number.
  // The arrows step the magnitude, so stepping below zero flips the switch too.
  const handleChange = (entered: number) => {
    const flip = entered < 0;
    const magnitude = Math.abs(entered);
    const nextClockwise = flip ? !clockwise : clockwise;
    onChange(nextClockwise ? magnitude : -magnitude);
  };

  return (
    <NumberInput
      label={label}
      title={title}
      value={Math.abs(value)}
      onChange={handleChange}
      step={step}
      large={large}
      accent={accent}
      kind={kind}
      mixed={mixed}
      alert={alert}
      pillAdornment
      adornment={{
        icon: DirectionIcon,
        title: t("flip"),
        onClick: () => onChange(-value),
        color: "secondary",
      }}
    />
  );
};

export default SignedNumberInput;
