import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import { TlTimeline } from './timeline';
import { TlTimelineItem } from './parts/timeline-item/timeline-item';

import { BlockUIModule } from '../blockui/index';
import {ScrollingModule} from '@angular/cdk/scrolling';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    BlockUIModule,
    ScrollingModule
  ],
  declarations: [
    TlTimeline,
    TlTimelineItem
  ],
  exports: [
    TlTimeline,
    TlTimelineItem
  ]
})
export class TimelineModule {}
