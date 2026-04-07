import { NextResponse } from "next/server";

export async function GET(){

  const res = await fetch(
    "https://datasets-server.huggingface.co/rows?dataset=iamwarint/wongnai-restaurant-review&config=default&split=train&offset=0&length=20"
  );

  const data = await res.json();

  const reviews = data.rows.map((r:any)=>({
    comment:r.row.review_body
  }));

  return NextResponse.json(reviews);
}