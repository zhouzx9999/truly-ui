'use strict';
/*
 MIT License

 Copyright (c) 2018 Temainfo Software

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:
 The above copyright notice and this permission notice shall be included in all
 copies or substantial portions of the Software.
 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 SOFTWARE.
 */

import {
  Component, Input, AfterViewInit, OnInit, Output, EventEmitter, Renderer2,
  ViewChild, ChangeDetectorRef, NgZone,
  OnChanges,
  ContentChild, TemplateRef, OnDestroy, SimpleChanges
} from '@angular/core';
import { animate, state, style, transition, trigger } from '@angular/animations';

import { Subject } from 'rxjs/Subject';

import 'rxjs/add/operator/debounceTime';
import 'rxjs/add/operator/distinctUntilChanged';
import 'rxjs/add/operator/map';
import 'rxjs/add/operator/filter';
import 'rxjs/add/operator/catch';

import { ListBoxContainerDirective } from './lisbox-container-directive';
import { KeyEvent } from '../core/enums/key-events';
import { ListBoxDataSourceService } from './services/listbox-datasource.service';
import { ListBoxListRenderService } from './parts/listbox-list-render';
import { AddNewRenderService } from './parts/listbox-addnew-render';
import { ListBoxTemplateRenderService } from './parts/listbox-template-render';

@Component( {
  selector: 'tl-listbox',
  templateUrl: './listbox.html',
  styleUrls: [ './listbox.scss' ],
  animations: [
    trigger(
      'enterAnimation', [
        state( 'true', style( { opacity: 1, transform: 'translate(0%,0%)' } ) ),
        state( 'false', style( { opacity: 0, transform: 'translate(0%,-3%)', flex: '0' } ) ),
        transition( '1 => 0', animate( '100ms' ) ),
        transition( '0 => 1', animate( '100ms' ) ),
      ]
    )
  ],
  providers: [
    ListBoxDataSourceService,
    ListBoxListRenderService,
    AddNewRenderService,
    ListBoxTemplateRenderService,
  ]
} )
export class TlListBox implements OnInit, AfterViewInit, OnDestroy, OnChanges {

  @Input() id = '';

  @Input() data: any = [];

  @Input() label = '';

  @Input() labelSize = '1em';

  @Input() labelDetail = '';

  @Input() labelDetailSize = '0.7em';

  @Input() rowHeight = 50;

  @Input() searchElement;

  @Input() charsToSearch = 2;

  @Input() addNew = false;

  @Input() rowsClient = 10;

  @Input() searchQuery = [];

  @Input() hiddenScroll = false;

  @Input() filterEmptyMessage = 'Nothing to Show';

  @Input() rowsPage = 50;

  @Input() height = 300;

  @Input() showArrows = true;

  @Input() fixedHeight = true;

  @Input() lazyMode = false;

  @Input() addNewMessage = 'Add New';

  @Input() listStripped = false;

  @Input() dynamicShowHide = false;

  @Input() customInput = false;

  @Input() focusOnScroll = true;

  @Input() dynamicFocus = true;

  @Output() clickItem: EventEmitter<any> = new EventEmitter();

  @Output() selectItem: EventEmitter<any> = new EventEmitter();

  @Output() clickAddNew: EventEmitter<any> = new EventEmitter();

  @Output() lazyLoad: EventEmitter<any> = new EventEmitter();

  @Output() filterData: EventEmitter<any> = new EventEmitter();

  @ViewChild( 'list' ) listBox;

  @ViewChild( 'itemContainer' ) itemContainer;

  @ViewChild( 'customTemplate' ) customTemplate;

  @ViewChild( ListBoxContainerDirective ) listTemplateContainer: ListBoxContainerDirective;

  @ContentChild( TemplateRef ) template: TemplateRef<Object>;

  public showList = true;

  public cursor = -1;

  public skip = 0;

  public typeOfData = 'object';

  public nothingToShow = false;

  public scrollTop = 0;

  public loadingMoreData = false;

  public filtering = false;

  public filteredData = [];

  public showMore = false;

  public itemSelected;

  public scrollFinish = false;

  private subject = new Subject();

  private lastRowViewport = 0;

  private time;

  private lastScrollTop = 0;

  private quantityInVisibleRows;

  private quantityVisibleRows;

  private take = this.rowsPage;

  private lastRow;

  private firstRow;

  private cursorViewPortPosition = 0;

  private lastSelected;

  private lastScrollTopOnKey;

  private scrollListener;

  private scrollByArrows;

  private isScrolling;

  constructor( public renderer: Renderer2, public change: ChangeDetectorRef, public zone: NgZone,
               public dataService: ListBoxDataSourceService,
               private addNewRenderService: AddNewRenderService,
               private listRenderService: ListBoxListRenderService,
               private listCustomRenderService: ListBoxTemplateRenderService ) {

    this.listRenderService.setInstanceListBox( this );
    this.listCustomRenderService.setInstanceListBox( this );
  }

  ngOnInit() {
    this.subject
      .debounceTime( 200 )
      .distinctUntilChanged( ( oldValue, newValue ) => oldValue === newValue )
      .filter( ( searchTerm ) => {
        if ( String( searchTerm ).length >= this.charsToSearch ) {
          return true;
        }
        this.handleSearchAsDefaultData();
        return false;
      } )
      .subscribe( searchTextValue => {
        this.handleSearch( searchTextValue );
        this.filterData.emit( this.filteredData );
        setTimeout( () => {
          this.removeSelected();
          this.resetCursors();
          this.addClassSelected( 0 );
        }, 1 );
      } );
  }

  ngAfterViewInit() {
    this.quantityVisibleRows = this.itemContainer.nativeElement.offsetHeight / this.rowHeight;
    this.quantityInVisibleRows = Math.round( ( this.rowsPage - this.quantityVisibleRows ) / 2 );

    this.lastRow = this.quantityVisibleRows - 1;
    this.firstRow = 0;
    this.renderPageData();
    this.addScrollListListener();
    this.validateProperties();
    this.addListenersSearchElement();
    this.addListenerFocusSearchElement();
    this.change.detectChanges();
  }

  validateDataType() {
    if ( !this.hasComplexObject() ) {
      this.typeOfData = 'ArrayString';
    }
  }

  hasComplexObject() {
    if ( this.data ) {
      const data = this.lazyMode ? this.data[ 'data' ] : this.data;
      for ( let item = 0; item < data.length; item++ ) {
        if ( typeof data[ item ] === 'object' ) {
          return true;
        }
      }
      return false;
    }
  }

  addListenerFocusSearchElement() {
    if ( this.searchElement ) {
      this.renderer.listen( this.searchElement.input.nativeElement, 'focus', ( $event ) => {
        if ( this.filtering && this.dynamicShowHide ) {
          this.addClassSelected( 0 );
        }
      } );
    }
  }

  subscribeClearButton() {
    this.searchElement.clear.subscribe( () => {
      this.filtering = false;
      this.resetSkipAndTake();
      this.validateFilteredAsEmpty();
      this.handleScrollShowMore();
      this.removeSelected();
      this.renderPageData();
      this.setNothingToShow( false );
    } );
  }

  addScrollListListener() {
    this.zone.run( () => {
      this.scrollListener = this.renderer.listen( this.itemContainer.nativeElement, 'scroll', ( $event ) => {
        $event.preventDefault();
        $event.stopPropagation();
        this.onScroll();
      } );
    } );
  }

  addListenersSearchElement() {
    if ( this.searchElement ) {
      this.subscribeClearButton();
      this.listenerHandlerElement();
      this.listenerKeyUpSearchElement();
    }
  }

  listenerHandlerElement() {
    if ( this.dynamicFocus ) {
      this.renderer.listen( this.searchElement.input.nativeElement, 'keydown', ( $event ) => {
        this.handleEventKeyDown( $event );
      } );
    } else {
      this.renderer.listen( this.itemContainer.nativeElement, 'keydown', ( $event ) => {
        this.handleEventKeyDown( $event );
      } );
    }
  }

  listenerKeyUpSearchElement() {
    this.renderer.listen( this.searchElement.input.nativeElement, 'keyup', ( $event ) => {
      switch ( $event.keyCode ) {
        case KeyEvent.ARROWDOWN:
          return;
        case KeyEvent.ARROWUP:
          return;
        case KeyEvent.ENTER:
          return;
        case KeyEvent.ESCAPE:
          return;
        case KeyEvent.PAGEDOWN:
          return;
        case KeyEvent.PAGEUP:
          return;
        case KeyEvent.HOME:
          return;
        case KeyEvent.END:
          return;
      }
      if ( !($event.keyCode === 65 && $event.ctrlKey) ) {
        this.subject.next( $event.target.value );
      }
    } );
  }

  public detectChanges() {
    this.zone.run( () => {
      this.change.detectChanges();
    } );
  }

  snapScreenScroll() {
    const calcLines = (this.getScrollPositionByContainer() * this.rowHeight);
    if ( (this.itemContainer.nativeElement.scrollTop % calcLines) ) {
      this.itemContainer.nativeElement.scrollTop = calcLines;
    }
  }

  getIndexOnList( listElement ) {
    for ( let element = 0; element < this.listBox.nativeElement.children.length; element++ ) {
      if ( listElement === this.listBox.nativeElement.children[ element ] ) {
        return element;
      }
    }
  }

  getScrollPositionByContainer() {
    return Math.floor( this.scrollTop / this.rowHeight );
  }

  getCursorViewPortPosition( index ) {
    this.cursorViewPortPosition =
      this.listBox.nativeElement.children[ index ].getAttribute( 'data-indexnumber' ) -
      this.getScrollPositionByContainer();
    this.lastScrollTopOnKey = this.itemContainer.nativeElement.scrollTop;
  }

  handleClickItem( item, indexDataSet, indexGlobal? ) {
    this.handleSelectItemList( item, indexDataSet );
    this.clickItem.emit( { 'row': item, 'index': indexGlobal ? indexGlobal : indexDataSet } );
  }

  handleSelectItem( item, indexDataSet, indexGlobal? ) {
    this.handleSelectItemList( item, indexDataSet );
    this.selectItem.emit( { 'row': item, 'index': indexGlobal ? indexGlobal : indexDataSet } );
  }

  handleSelectItemList( item, indexDataSet ) {
    this.removeSelected();
    this.cursor = indexDataSet;
    this.itemSelected = item;
    this.getCursorViewPortPosition( indexDataSet );
    this.updateLastSelect();
    this.setHandlerFocus();
  }

  removeSelected() {
    for ( let element = 0; element < this.listBox.nativeElement.children.length; element++ ) {
      if ( this.listBox.nativeElement.children[ element ].getAttribute( 'class' ).includes( 'item-selected-listbox' ) ) {
        this.removeClassSelected( element );
      }
    }
  }

  handleEventKeyDown( $event ) {
    switch ( $event.keyCode ) {
      case KeyEvent.ARROWDOWN :
        this.handleKeyArrowDown( $event );
        return;
      case KeyEvent.ARROWUP:
        this.handleKeyArrowUp( $event );
        return;
      case KeyEvent.ESCAPE:
        this.handleEscape( $event );
        return;
      case KeyEvent.ENTER:
        this.handleKeyEnter( $event );
        return;
      case KeyEvent.ARROWLEFT:
        $event.stopPropagation();
        return;
      case KeyEvent.ARROWRIGHT:
        $event.stopPropagation();
        return;
      case KeyEvent.PAGEDOWN:
        this.handlePageDown( $event );
        return;
      case KeyEvent.PAGEUP:
        this.handlePageUp( $event );
        return;
      case KeyEvent.HOME:
        this.handleHome( $event );
        return;
      case KeyEvent.END:
        this.handleEnd( $event );
        return;
    }
  }

  handleHome( $event ) {
    this.disableKeyEvent( $event );
    this.itemContainer.nativeElement.scrollTop = 0;
  }

  handleEnd( $event ) {
    this.disableKeyEvent( $event );
    if ( this.isEndOfTheListScroll() ) {
      return;
    }
    this.itemContainer.nativeElement.scrollTop = this.listBox.nativeElement.offsetHeight;
  }

  handlePageDown( $event ) {
    this.disableKeyEvent( $event );
    if ( this.isEndOfTheListScroll() ) {
      return;
    }
    this.itemContainer.nativeElement.scrollTop =
      this.itemContainer.nativeElement.scrollTop + (this.rowHeight * this.rowsPage);
  }

  handlePageUp( $event ) {
    this.disableKeyEvent( $event );
    this.itemContainer.nativeElement.scrollTop =
      this.itemContainer.nativeElement.scrollTop - (this.rowHeight * this.rowsPage);
  }

  handleEscape( $event ) {
    $event.stopPropagation();
    this.handleOpenFocusList();
  }

  handleKeyEnter( $event ) {
    if ( this.itemSelected && this.dataService.datasource.indexOf( this.itemSelected ) > -1 ) {
      const index = this.dataService.datasource.indexOf( this.itemSelected );
      this.handleSelectItem( this.itemSelected, index,
        this.listBox.nativeElement.children[ index ].getAttribute( 'data-indexnumber' ) );
    }
    $event.preventDefault();
    this.addNewRenderService.handleAddNewSelected();
  }

  handleOpenFocusList() {
    if ( this.dynamicShowHide ) {
      this.showList = false;
      this.detectChanges();
    }
  }

  handleKeyArrowDown( $event ) {
    if ( this.loadingMoreData ) {
      $event.stopPropagation();
      return;
    }
    this.handleValueSearchElement();
    if ( this.showList ) {
      $event.preventDefault();
      $event.stopPropagation();
      if ( this.existChildrenElements() ) {
        this.handleLastScrollTopOnKey();
        this.scrollByArrows = true;
        if ( this.isCursorLessThanListLength() ) {
          this.isCursorViewNewThanVisibleRows() ?
            this.setScrollTopAndFocusNext() : this.setCursorViewNextAndFocusNext();
          this.handleCursorWithoutSearchElement();
          this.setLastSelected();
          this.setLastScrollTopOnKey();
        }
      }
    }
  }

  handleKeyArrowUp( $event ) {
    if ( this.loadingMoreData ) {
      $event.stopPropagation();
      return;
    }
    this.handleValueSearchElement();
    if ( this.showList ) {
      $event.preventDefault();
      $event.stopPropagation();
      if ( this.existChildrenElements() ) {
        this.handleLastScrollTopOnKey();
        this.scrollByArrows = true;
        if ( this.isCursorGreaterThanZero() ) {
          this.isCursorViewLessOrEqualZero() ? this.setScrollTopAndFocusPrevious() :
            this.setCursorViewNextAndFocusPrevious();
          this.handleCursorWithoutSearchElement();
          this.setLastSelected();
          this.setLastScrollTopOnKey();
        }
      }
    }
  }

  disableKeyEvent( $event ) {
    $event.preventDefault();
    $event.stopPropagation();
  }

  setScrollTopAndFocusNext() {
    this.itemContainer.nativeElement.scrollTop += this.rowHeight;
    this.setFocusOnNextCursor();
  }

  setHandlerFocus() {
    if ( this.dynamicFocus && !this.dynamicShowHide ) {
      setTimeout( () => {
        this.searchElement.input.nativeElement.focus();
      }, 1 );
    } else if ( !this.dynamicShowHide ) {
      setTimeout( () => {
        this.itemContainer.nativeElement.focus();
      }, 1 );
    }
  }

  setCursorViewNextAndFocusNext() {
    this.cursorViewPortPosition++;
    this.setFocusOnNextCursor();
  }

  isCursorLessThanListLength() {
    return this.cursor < this.listBox.nativeElement.children.length - 1;
  }

  isCursorViewNewThanVisibleRows() {
    return this.cursorViewPortPosition >= this.quantityVisibleRows - 1;
  }

  handleValueSearchElement() {
    if ( (this.searchElement.model) && (!this.showList) ) {
      return;
    }
  }

  handleCursorWithoutSearchElement() {
    if ( !this.searchElement ) {
      this.cursor++;
    }
  }

  isCursorGreaterThanZero() {
    return this.cursor > 0;
  }

  isCursorViewLessOrEqualZero() {
    return this.cursorViewPortPosition <= 0;
  }

  setScrollTopAndFocusPrevious() {
    this.itemContainer.nativeElement.scrollTop -= this.rowHeight;
    this.setFocusOnPreviousCursor();
  }

  setCursorViewNextAndFocusPrevious() {
    this.cursorViewPortPosition--;
    this.setFocusOnPreviousCursor();
  }

  handleLastScrollTopOnKey() {
    if ( !this.isLastScrollTopOnKeyEqualsScroll() ) {
      if ( !this.filtering ) {
        this.itemContainer.nativeElement.scrollTop = this.lastScrollTopOnKey;
      }
    }
  }

  handleSearch( searchTerm ) {
    if ( searchTerm ) {
      this.showList = true;
      this.detectChanges();
      this.setScrollTopZero();
      this.addScrollListListener();
      this.resetCursors();
      this.removeSelected();
      this.handleSearchAsFoundData( searchTerm );
      this.handleScrollShowMore();
    }
  }

  handleSearchAsDefaultData() {
    this.filtering = false;
    this.filterData.emit( this.data );
    this.dataService.updateDataSource( this.data );
    this.validateFilteredAsEmpty();
    this.resetSkipAndTake();
    this.renderPageData();
    setTimeout( () => {
      this.removeSelected();
      this.resetCursors();
      this.addClassSelected( 0 );
    }, 1 );
  }

  handleSearchAsFoundData( searchTerm ) {
    if ( this.lazyMode ) {
      this.getDataLazy( searchTerm );
      return;
    }
    this.itemSelected = null;
    this.filteredData = !this.isDataArrayString() ? this.filterDataObject( searchTerm ) : this.filterDataString( searchTerm );
    this.handleSkipAndTakeWhileSearching();
    this.validateFilteredAsEmpty();
  }

  filterDataString( searchTerm ) {
    this.filtering = true;
    return this.data.filter( ( item ) => {
      return item.toString().toLowerCase().includes( searchTerm.toString().toLowerCase() );
    } );
  }

  handleSkipAndTakeWhileSearching() {
    if ( Array( this.filteredData ).length ) {
      this.setSkipAndTakeAsFilteredData();
      this.renderPageData();
    } else {
      this.setSkipAndTakeAsDataSource();
      this.renderPageData();
    }
  }

  handleScrollShowMore() {
    this.dataService.datasource.length > 10 ?
      this.setShowMore( true ) : this.setShowMore( false );
  }

  setShowMore( value ) {
    this.showMore = value;
    this.change.detectChanges();
  }

  handleSearchQuery() {
    this.handleSearchQueryAsArrayString();
    const data = this.lazyMode ? this.data.data[ 0 ] : this.data[ 0 ];
    if ( this.searchQuery.length === 0 ) {
      Object.keys( data ).forEach( ( value ) => {
        this.searchQuery.push( value );
      } );
    }
  }

  handleSearchQueryAsArrayString() {
    if ( this.isDataArrayString() ) {
      return this.searchQuery = this.data;
    }
  }

  isDataArrayString() {
    return this.typeOfData === 'ArrayString';
  }

  handleScrollDown() {
    this.handleScrollFinish();
    if ( !this.isDataSourceGreaterThanRowsPage() ) {
      return;
    }
    if ( this.lastChildElement().getBoundingClientRect() ) {
      if ( ( this.lastChildElement().offsetTop >= this.scrollTop ) && (  this.listBox.nativeElement.children.length > 0 ) ) {
        if ( this.lastChildElement().getBoundingClientRect().bottom < this.parentElement().bottom + (5 * this.rowHeight) ) {
          this.skip = this.lastRowViewport - this.quantityInVisibleRows - this.quantityVisibleRows;
          this.take = this.lastRowViewport + this.quantityInVisibleRows;
          const data = this.filtering ? this.filteredData : this.data;
          const dataLength = this.lazyMode ? data.total : data.length;
          this.take = this.take > dataLength ? dataLength : this.take;
          this.renderPageData();
        }
      } else {
        this.handleScrollFast( 'DOWN' );
      }
    }
  }

  handleScrollUp() {
    this.handleScrollFinish();
    if ( this.firstChildElement() ) {
      if ( ( this.firstChildElement().offsetTop <= this.scrollTop ) && (  this.listBox.nativeElement.children.length > 0 ) ) {
        if ( this.firstChildElement().getBoundingClientRect().top > this.parentElement().top - (5 * this.rowHeight) ) {
          this.skip = this.firstChildElement().getAttribute( 'data-indexnumber' ) - this.quantityInVisibleRows;
          this.take = this.skip + this.quantityVisibleRows + (this.quantityInVisibleRows * 2);
          this.validateSkipAndTakeRange();
          this.renderPageData();
        }
      } else {
        this.handleScrollFast( 'UP' );
      }
    }
  }

  handleScrollFinish() {
    this.scrollFinish = (this.itemContainer.nativeElement.scrollTop +
    (this.quantityVisibleRows * this.rowHeight) >= this.listBox.nativeElement.offsetHeight);

    if ( this.scrollFinish ) {
      this.onShowMoreMouseOut();
    }
  }

  handleScrollFast( direction ) {
    this.isScrolling = direction;
    const currentStartIndex = this.getScrollPositionByContainer();
    this.skip = currentStartIndex - this.quantityInVisibleRows;
    this.take = currentStartIndex + this.quantityVisibleRows + this.quantityInVisibleRows;
    this.scrollByArrows = false;
    this.validateSkipAndTakeRange();
    this.renderPageData();
  }

  firstChildElement() {
    return this.listBox.nativeElement.children[ 0 ];
  }

  lastChildElement() {
    return this.listBox.nativeElement.children[ this.listBox.nativeElement.children.length - 1 ];
  }

  parentElement() {
    return this.itemContainer.nativeElement.getBoundingClientRect();
  }

  filterDataObject( searchTerm ) {
    const filter = [];
    this.filtering = true;
    const data = this.lazyMode ? this.data.data : this.data;
    data.forEach( ( item ) => {
      this.searchQuery.forEach( ( query ) => {
        if ( String( item[ query ] ).toLowerCase().trim().includes( searchTerm.toLowerCase().trim() ) ) {
          if ( filter.indexOf( item ) === -1 ) {
            filter.push( item );
          }
        }
      } );
    } );
    return filter;
  }

  renderPageData() {
    if ( this.filtering ) {
      this.dataService.updateDataSource( this.filteredData.slice( this.skip, this.take ) );
      this.handleRenderList();
      this.change.detectChanges();
    } else {
      if ( !this.data ) {
        return;
      }
      this.lazyMode ? this.getDataLazy() : this.getDataMemory();
    }
  }

  getDataMemory() {
    this.dataService.updateDataSource( this.data.slice( this.skip, this.take ) );
    this.handleRenderList();
    this.change.detectChanges();
  }

  getDataLazy( term? ) {
    this.loadingMoreData = true;
    const fields = {};
    Object.keys( this.searchQuery ).forEach( ( item ) => {
      const keyName = this.searchQuery[ item ];
      fields[ keyName ] = { matchMode: 'contains', value: term };
    } );
    const filter = {
      fields: fields,
      operator: 'or'
    };
    this.lazyLoad.emit( { skip: this.skip, take: this.take, filters: filter } );
  }

  renderList() {
    this.listRenderService.createList();
  }

  renderCustomList() {
    this.listCustomRenderService.createCustomTemplate();
  }

  handleCreateAddNew() {
    if ( !this.addNew ) {
      return;
    }
    this.addNewRenderService.setInstanceListBox( this );
    this.addNewRenderService.createAddNew();
  }

  handleClickAddNew() {
    this.clickAddNew.emit();
    this.showList = false;
    this.change.detectChanges();
  }

  getListBoxHeight() {
    if ( (this.filteredData.length < this.rowsClient) && this.filtering ) {
      return this.addNew ? (this.filteredData.length * this.rowHeight) + (this.rowHeight) :
        (this.filteredData.length * this.rowHeight);
    }
    return this.addNew ? (this.rowsClient * this.rowHeight) : this.rowsClient * this.rowHeight;
  }

  getElementOfList() {
    for ( let element = 0; element < this.listBox.nativeElement.children.length; element++ ) {
      if ( this.listBox.nativeElement.children[ element ].getAttribute( 'data-indexnumber' ) === this.lastSelected ) {
        this.cursor = element;
        return this.updateLastSelect();
      }
    }
  }

  updateLastSelect() {
    if ( this.listBox.nativeElement.children[ this.cursor ] ) {
      this.addClassSelected( this.cursor );
    }
  }

  handleRemoveListChildren() {
    if ( this.listBox.nativeElement.children.length > 0 ) {
      this.removeChildren();
    }
  }

  validateSkipAndTakeRange() {
    if ( this.skip < 0 ) {
      this.skip = 0;
      this.take = this.rowsPage;
    }
  }

  validateFilteredAsEmpty() {
    this.dataService.datasource.length === 0 ? this.setNothingToShow( true )
      : this.setNothingToShow( false );
  }

  setNothingToShow( value ) {
    this.nothingToShow = value;
    this.change.detectChanges();
  }

  validateProperties() {
    if ( (!this.existCustomTemplate()) && (!this.label) && (this.typeOfData !== 'ArrayString') ) {
      throw new EvalError( 'At least the property [label] is required when the Custom Template is not defined' );
    }
  }

  onScroll() {
    this.setScrollTop();
    this.setCurrentRow();
    this.isScrollDown() ? this.handleScrollDown() : this.handleScrollUp();
    this.setLastScrollTop();
  }

  setFocusOnLast() {
    const end = this.getScrollPositionByContainer() + this.quantityVisibleRows - 1;
    const strDataIndex: string = 'li[data-indexnumber="' + end + '"]';
    const element = document.querySelector( strDataIndex );
    if ( element ) {
      const indexElementDataSource = this.getIndexOnList( element );
      this.handleScrollWhileChangingCursor();
      this.addClassSelected( indexElementDataSource );
      this.setCursorsWhileScrolling( element );
      this.setHandlerFocus();
    }
  }

  mouseUpList( $event ) {
    $event.stopPropagation();
    if ( $event.target === this.itemContainer.nativeElement ) {
      this.snapScreenScroll();
      this.removeSelected();
      this.isScrolling === 'DOWN' ? this.setFocusOnLast() : this.setFocusOnFirst();
    }
  }

  setFocusOnFirst() {
    const strDataIndex: string = 'li[data-indexnumber="' + this.getScrollPositionByContainer() + '"]';
    const element = document.querySelector( strDataIndex );
    if ( element ) {
      const indexElementDataSource = this.getIndexOnList( element );
      this.handleScrollWhileChangingCursor();

      this.addClassSelected( indexElementDataSource );
      this.setCursorsWhileScrolling( element );
      this.setHandlerFocus();
    }
  }

  handleScrollWhileChangingCursor() {
    this.scrollListener();
    this.setLastScrollTopOnKey();
    this.addScrollListListener();
  }

  setCursorsWhileScrolling( element ) {
    this.cursorViewPortPosition = this.quantityVisibleRows;
    this.cursor = this.getIndexOnList( element );
  }

  setCurrentRow() {
    this.lastRowViewport = Math.round( ( this.itemContainer.nativeElement.offsetHeight + this.scrollTop  ) / this.rowHeight );
  }

  setScrollTop() {
    this.scrollTop = this.itemContainer.nativeElement.scrollTop;
  }

  setLastScrollTop() {
    this.lastScrollTop = this.scrollTop;
  }

  setSkipAndTakeAsDataSource() {
    this.skip = 0;
    this.take = this.dataService.datasource.length;
  }

  setSkipAndTakeAsFilteredData() {
    this.skip = 0;
    this.take = this.filteredData.length;
  }

  setFocusOnNextCursor() {
    if ( this.cursor > -1 ) {
      this.removeClassSelected( this.cursor );
    }
    const index = this.cursor + 1;
    this.addClassSelected( index );
    this.handleSelectItemWhileNavigating( index );
  }

  setScrollTopZero() {
    this.scrollListener();
    this.itemContainer.nativeElement.scrollTop = 0;
  }

  isElementAddNew( index ) {
    return this.listBox.nativeElement.children[ index ].getAttribute( 'class' ).includes( 'addNew' );
  }

  addClassSelected( index ) {
    this.itemSelected = this.dataService.datasource[ index ];
    if ( this.listBox.nativeElement.children[ index ] !== undefined ) {
      this.renderer.addClass( this.listBox.nativeElement.children[ index ], 'item-selected-listbox' );
    }
  }

  removeClassSelected( index ) {
    this.itemSelected = null;
    if ( this.listBox.nativeElement.children[ index ] !== undefined ) {
      this.renderer.removeClass( this.listBox.nativeElement.children[ index ], 'item-selected-listbox' );
    }
  }

  setFocusOnPreviousCursor() {
    if ( this.cursor > -1 ) {
      this.removeClassSelected( this.cursor );
    }
    const index = this.cursor - 1;
    this.addClassSelected( index );
    this.handleSelectItemWhileNavigating( index );
  }

  handleSelectItemWhileNavigating( index ) {
    if ( (this.searchElement) && (!this.isElementAddNew( index )) ) {
      return this.handleSelectItem( this.dataService.datasource[ index ], index,
        this.listBox.nativeElement.children[ index ].getAttribute( 'data-indexnumber' ) );
    }
    this.cursor++;
  }

  setLastScrollTopOnKey() {
    this.lastScrollTopOnKey = this.itemContainer.nativeElement.scrollTop;
  }

  setLastSelected() {
    this.lastSelected = this.listBox.nativeElement.children[ this.cursor ].getAttribute( 'data-indexnumber' );
  }

  isScrollDown() {
    return this.scrollTop > this.lastScrollTop;
  }

  isLastScrollTopOnKeyEqualsScroll() {
    return (this.lastScrollTopOnKey === this.itemContainer.nativeElement.scrollTop);
  }

  isDataSourceGreaterThanRowsPage() {
    const data = this.filtering ? this.filteredData : this.data;
    return (this.lazyMode ? data.total : data.length) > this.rowsPage;
  }

  isEndOfTheListScroll() {
    return ((this.itemContainer.nativeElement.scrollTop + (this.rowsClient * this.rowHeight)) ===
    this.listBox.nativeElement.offsetHeight);
  }

  existChildrenElements() {
    return this.listBox.nativeElement.children;
  }

  existCustomTemplate() {
    if ( this.customInput ) {
      return true;
    }
    for ( const node of this.customTemplate.nativeElement.childNodes ) {
      if ( node.nodeName === '#comment' ) {
        return true;
      }
    }
    return false;
  }

  resetSkipAndTake() {
    this.skip = 0;
    this.take = this.rowsPage;
  }

  onShowMoreMouseOut() {
    this.scrollByArrows = false;
    clearTimeout( this.time );
  }

  onShowMoreMouseIn( direction ) {
    this.scrollByArrows = true;
    this.time = setTimeout( () => {
      direction === 'down' ? this.scrollToDown( direction ) : this.scrollToUp( direction );
    }, 100 );
  }

  scrollToUp( direction ) {
    if ( this.scrollTop > 0 ) {
      this.itemContainer.nativeElement.scrollTop = this.itemContainer.nativeElement.scrollTop - this.rowHeight;
      this.onShowMoreMouseIn( direction );
    }
  }

  scrollToDown( direction ) {
    if ( this.scrollTop < this.listBox.nativeElement.offsetHeight ) {
      this.itemContainer.nativeElement.scrollTop = this.itemContainer.nativeElement.scrollTop + this.rowHeight;
      this.onShowMoreMouseIn( direction );
    }
  }

  public resetCursors() {
    this.itemContainer.nativeElement.scrollTop = 0;
    this.cursor = 0;
    this.cursorViewPortPosition = 0;
  }

  removeChildren() {
    while ( this.listBox.nativeElement.hasChildNodes() ) {
      this.listBox.nativeElement.removeChild( this.listBox.nativeElement.lastChild );
    }
  }

  handleRenderList() {
    this.existCustomTemplate() ? this.renderCustomList() : this.renderList();
  }

  ngOnChanges( change: SimpleChanges ) {
    this.validateDataType();
    if ( this.data ) {
      this.dataService.updateDataSource( this.lazyMode ? this.data.data : this.data ).then( value => {
        this.handleRenderList();
      } );
      this.handleSearchQuery();
      this.loadingMoreData = false;
      this.change.detectChanges();
    }
  }

  ngOnDestroy() {
    this.scrollListener();
  }

}

